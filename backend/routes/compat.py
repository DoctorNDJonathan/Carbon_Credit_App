"""
routes/compat.py
----------------
Compatibility shim that maps the frontend's expected API shape to the
backend's internal logic.  Mounted at /api (no version prefix) so the
frontend's hardcoded URLs work without any frontend changes.

Frontend contract:
  GET  /api/prices?range=<days>         → [{date, price}]
  GET  /api/portfolio                   → [{id,date,type,credits,price,total,pnl}]
  POST /api/forecast                    → {prediction,recommendation,confidence,
                                           price_target,key_factors,generated_at}
  POST /api/calculate-footprint         → {electricity_co2,travel_co2,
                                           manufacturing_co2,total_co2,
                                           credits_needed,estimated_cost}
"""

import json
import math
import os
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import CarbonPrice, Transaction, get_db

router = APIRouter(prefix="/api", tags=["Frontend Compat"])

PRICE_MARKET = "EU ETS"   # market shown in the price chart

# ---------------------------------------------------------------------------
# GET /api/prices?range=<days>
# Returns [{date: "Apr 5", price: 74.20}, ...] — exactly what Recharts needs
# ---------------------------------------------------------------------------

@router.get("/prices")
def compat_prices(
    range: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    start = date.today() - timedelta(days=range)
    rows = (
        db.query(CarbonPrice)
        .filter(CarbonPrice.market == PRICE_MARKET, CarbonPrice.date >= start)
        .order_by(CarbonPrice.date)
        .all()
    )
    return [
        {
            "date":  row.date.strftime("%-d %b"),   # e.g. "5 Apr"
            "price": row.close,
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# GET /api/portfolio
# Returns [{id, date, type, credits, price, total, pnl}, ...]
# PnL is computed per-sell using the running average cost basis.
# ---------------------------------------------------------------------------

@router.get("/portfolio")
def compat_portfolio(db: Session = Depends(get_db)):
    txns = (
        db.query(Transaction)
        .order_by(Transaction.date)
        .all()
    )

    # Track running avg cost per market to compute realized P&L on sells
    state: dict[str, dict] = defaultdict(lambda: {"qty": 0.0, "cost": 0.0})
    result = []

    for tx in txns:
        s = state[tx.market]
        pnl = None

        if tx.transaction_type == "buy":
            s["qty"]  += tx.quantity
            s["cost"] += tx.total_value
        else:
            avg_cost = (s["cost"] / s["qty"]) if s["qty"] else 0.0
            pnl = round(tx.total_value - (tx.quantity * avg_cost), 2)
            s["qty"]  -= tx.quantity
            s["cost"] -= tx.quantity * avg_cost

        result.append({
            "id":      tx.id,
            "date":    tx.date.strftime("%Y-%m-%d"),
            "type":    tx.transaction_type.upper(),
            "credits": tx.quantity,
            "price":   tx.price_per_unit,
            "total":   tx.total_value,
            "pnl":     pnl,
        })

    # Return newest first (matches the frontend's default sort)
    return list(reversed(result))


# ---------------------------------------------------------------------------
# POST /api/forecast
# No request body — defaults to EU ETS, 30-day horizon.
# Maps Claude's structured response to the simpler frontend shape:
#   prediction      – plain-English paragraph
#   recommendation  – "BUY" | "SELL" | "HOLD"
#   confidence      – integer 0-100
#   price_target    – float (mid of the 1-month range)
#   key_factors     – list[str]
#   generated_at    – ISO timestamp string
# ---------------------------------------------------------------------------

CONFIDENCE_MAP = {"high": 82, "medium": 58, "low": 31}

def _build_forecast_system_prompt() -> str:
    return """You are a senior carbon credit market analyst at a top ESG-focused asset manager.

Analyse the carbon credit market data provided and produce a structured price forecast.

Respond with a single valid JSON object — no markdown, no prose, only JSON:

{
  "price_targets": [
    {"label": "1-week",  "low": <float>, "mid": <float>, "high": <float>},
    {"label": "2-week",  "low": <float>, "mid": <float>, "high": <float>},
    {"label": "1-month", "low": <float>, "mid": <float>, "high": <float>}
  ],
  "trend":              "bullish" | "bearish" | "neutral",
  "confidence":         "high" | "medium" | "low",
  "recommendation":     "buy" | "sell" | "hold",
  "recommended_action": "<one concise sentence for a corporate sustainability manager>",
  "key_drivers": ["<driver 1>", "<driver 2>", "<driver 3>"],
  "risk_factors": ["<risk 1>", "<risk 2>"],
  "disclaimer": "This forecast is generated by AI for informational purposes only."
}"""


def _build_forecast_user_prompt(rows: list, high_52w: float, low_52w: float,
                                 avg_52w: float, ma5: Optional[float],
                                 ma20: Optional[float]) -> str:
    price_table = "\n".join(
        f"  {r.date}  close={r.close:.2f}  vol={r.volume:,}"
        for r in rows[-30:]
    )
    momentum = "N/A"
    if ma5 and ma20:
        direction = "above" if ma5 > ma20 else "below"
        momentum = f"5-day MA={ma5:.2f} is {direction} 20-day MA={ma20:.2f}"

    return f"""Market: {PRICE_MARKET}
Forecast horizon: 30 trading days
Today: {date.today()}

=== Last 30 trading days (close price, USD/tonne) ===
{price_table}

=== 52-week stats ===
High: ${high_52w:.2f}  Low: ${low_52w:.2f}  Avg: ${avg_52w:.2f}
Momentum: {momentum}

Produce your JSON forecast."""


@router.post("/forecast")
def compat_forecast(db: Session = Depends(get_db)):
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or api_key.startswith("sk-ant-your"):
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured. Add it to your .env file."
        )

    cutoff = date.today() - timedelta(weeks=52)
    rows = (
        db.query(CarbonPrice)
        .filter(CarbonPrice.market == PRICE_MARKET, CarbonPrice.date >= cutoff)
        .order_by(CarbonPrice.date)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for {PRICE_MARKET}")

    closes  = [r.close for r in rows]
    high_52 = max(r.high_price for r in rows)
    low_52  = min(r.low_price  for r in rows)
    avg_52  = round(mean(closes), 2)
    ma5     = round(mean(closes[-5:]),  2) if len(closes) >= 5  else None
    ma20    = round(mean(closes[-20:]), 2) if len(closes) >= 20 else None

    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=_build_forecast_system_prompt(),
            messages=[{
                "role": "user",
                "content": _build_forecast_user_prompt(rows, high_52, low_52, avg_52, ma5, ma20),
            }],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid Anthropic API key.")
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="Anthropic rate limit reached.")
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {exc}")

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Claude returned invalid JSON.")

    # Find the 1-month price target mid for the headline number
    price_target = rows[-1].close  # fallback
    for pt in data.get("price_targets", []):
        if pt.get("label") == "1-month":
            price_target = pt.get("mid", price_target)
            break

    rec = data.get("recommendation", "hold").upper()
    if rec not in ("BUY", "SELL", "HOLD"):
        rec = "HOLD"

    conf_str = data.get("confidence", "medium").lower()
    confidence = CONFIDENCE_MAP.get(conf_str, 55)

    # Build a narrative paragraph from the structured fields
    drivers_text = "  ".join(f"• {d}" for d in data.get("key_drivers", []))
    prediction = (
        f"{data.get('recommended_action', '')}  "
        f"Key drivers: {drivers_text}"
    ).strip()

    return {
        "prediction":      prediction,
        "recommendation":  rec,
        "confidence":      confidence,
        "price_target":    round(price_target, 2),
        "key_factors":     data.get("key_drivers", []),
        "generated_at":    datetime.utcnow().isoformat() + "Z",
    }


# ---------------------------------------------------------------------------
# POST /api/calculate-footprint
# Input:  { electricity_kwh, travel_km, manufacturing_tonnes }
# Output: { electricity_co2, travel_co2, manufacturing_co2,
#           total_co2, credits_needed, estimated_cost }
# ---------------------------------------------------------------------------

# Emission factors
EF_ELECTRICITY   = 0.000233   # tCO₂ / kWh  (matches frontend legend)
EF_TRAVEL        = 0.000255   # tCO₂ / km
EF_MANUFACTURING = 2.5        # tCO₂ / tonne


class FootprintIn(BaseModel):
    electricity_kwh:      float = 0.0
    travel_km:            float = 0.0
    manufacturing_tonnes: float = 0.0


@router.post("/calculate-footprint")
def compat_footprint(payload: FootprintIn, db: Session = Depends(get_db)):
    elec_co2 = round(payload.electricity_kwh      * EF_ELECTRICITY,   4)
    trav_co2 = round(payload.travel_km             * EF_TRAVEL,        4)
    mfg_co2  = round(payload.manufacturing_tonnes  * EF_MANUFACTURING, 4)
    total    = round(elec_co2 + trav_co2 + mfg_co2, 4)

    credits_needed = math.ceil(total)

    # Use latest voluntary price if available, otherwise use frontend's default
    vol_row = (
        db.query(CarbonPrice)
        .filter(CarbonPrice.market == "Voluntary")
        .order_by(desc(CarbonPrice.date))
        .first()
    )
    credit_price = vol_row.close if vol_row else 30.50
    estimated_cost = round(credits_needed * credit_price, 2)

    return {
        "electricity_co2":   elec_co2,
        "travel_co2":        trav_co2,
        "manufacturing_co2": mfg_co2,
        "total_co2":         total,
        "credits_needed":    credits_needed,
        "estimated_cost":    estimated_cost,
    }
