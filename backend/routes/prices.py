"""
routes/prices.py
----------------
Price Tracker endpoints.

GET  /prices/markets          – list of available markets
GET  /prices/latest           – most recent close price per market
GET  /prices/                 – paginated history with optional filters
GET  /prices/{market}/history – full OHLCV history for one market
POST /prices/                 – manually insert a new price record (admin use)
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import CarbonPrice, get_db

router = APIRouter(prefix="/prices", tags=["Price Tracker"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class PriceOut(BaseModel):
    id:         int
    market:     str
    date:       date
    open_price: float
    high_price: float
    low_price:  float
    close:      float
    volume:     int

    model_config = {"from_attributes": True}


class PriceCreate(BaseModel):
    market:     str = Field(..., examples=["EU ETS"])
    date:       date
    open_price: float = Field(..., gt=0)
    high_price: float = Field(..., gt=0)
    low_price:  float = Field(..., gt=0)
    close:      float = Field(..., gt=0)
    volume:     int   = Field(..., gt=0)


class LatestPrice(BaseModel):
    market:     str
    date:       date
    close:      float
    change_pct: float   # % change vs previous day


class MarketSummary(BaseModel):
    market:       str
    latest_close: float
    latest_date:  date
    high_52w:     float
    low_52w:      float
    avg_volume:   int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/markets", summary="List available markets")
def list_markets(db: Session = Depends(get_db)) -> list[str]:
    rows = db.query(CarbonPrice.market).distinct().all()
    return [r[0] for r in rows]


@router.get("/latest", summary="Latest price per market", response_model=list[LatestPrice])
def latest_prices(db: Session = Depends(get_db)):
    markets = db.query(CarbonPrice.market).distinct().all()
    results = []

    for (market,) in markets:
        # two most recent rows for this market
        rows = (
            db.query(CarbonPrice)
            .filter(CarbonPrice.market == market)
            .order_by(desc(CarbonPrice.date))
            .limit(2)
            .all()
        )
        if not rows:
            continue
        latest = rows[0]
        prev_close = rows[1].close if len(rows) > 1 else latest.close
        change_pct = round((latest.close - prev_close) / prev_close * 100, 2) if prev_close else 0.0

        results.append(LatestPrice(
            market=market,
            date=latest.date,
            close=latest.close,
            change_pct=change_pct,
        ))

    return results


@router.get("/summary", summary="52-week summary per market", response_model=list[MarketSummary])
def market_summary(db: Session = Depends(get_db)):
    from datetime import timedelta
    cutoff = date.today() - timedelta(weeks=52)
    markets = db.query(CarbonPrice.market).distinct().all()
    results = []

    for (market,) in markets:
        rows = (
            db.query(CarbonPrice)
            .filter(CarbonPrice.market == market, CarbonPrice.date >= cutoff)
            .order_by(desc(CarbonPrice.date))
            .all()
        )
        if not rows:
            continue
        closes   = [r.close for r in rows]
        volumes  = [r.volume for r in rows]
        highs    = [r.high_price for r in rows]
        lows     = [r.low_price for r in rows]
        results.append(MarketSummary(
            market=market,
            latest_close=rows[0].close,
            latest_date=rows[0].date,
            high_52w=round(max(highs), 2),
            low_52w=round(min(lows), 2),
            avg_volume=int(sum(volumes) / len(volumes)),
        ))

    return results


@router.get("/", summary="Paginated price history", response_model=list[PriceOut])
def get_prices(
    market:     Optional[str]  = Query(None, description="Filter by market name"),
    start_date: Optional[date] = Query(None, alias="start"),
    end_date:   Optional[date] = Query(None, alias="end"),
    limit:      int            = Query(100, ge=1, le=1000),
    offset:     int            = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(CarbonPrice)
    if market:
        q = q.filter(CarbonPrice.market == market)
    if start_date:
        q = q.filter(CarbonPrice.date >= start_date)
    if end_date:
        q = q.filter(CarbonPrice.date <= end_date)
    return q.order_by(desc(CarbonPrice.date)).offset(offset).limit(limit).all()


@router.get("/{market}/history", summary="Full OHLCV history for one market",
            response_model=list[PriceOut])
def market_history(
    market: str,
    start_date: Optional[date] = Query(None, alias="start"),
    end_date:   Optional[date] = Query(None, alias="end"),
    db: Session = Depends(get_db),
):
    q = db.query(CarbonPrice).filter(CarbonPrice.market == market)
    if start_date:
        q = q.filter(CarbonPrice.date >= start_date)
    if end_date:
        q = q.filter(CarbonPrice.date <= end_date)
    rows = q.order_by(CarbonPrice.date).all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data found for market '{market}'")
    return rows


@router.post("/", summary="Insert a new price record", response_model=PriceOut, status_code=201)
def create_price(payload: PriceCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(CarbonPrice)
        .filter(CarbonPrice.market == payload.market, CarbonPrice.date == payload.date)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Price for {payload.market} on {payload.date} already exists."
        )
    row = CarbonPrice(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
