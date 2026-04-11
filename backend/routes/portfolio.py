"""
routes/portfolio.py
-------------------
Portfolio Manager endpoints.

POST /portfolio/transactions        – log a buy or sell
GET  /portfolio/transactions        – list all transactions (filterable)
DELETE /portfolio/transactions/{id} – remove a transaction
GET  /portfolio/holdings            – current holdings per market
GET  /portfolio/pnl                 – P&L summary (realized + unrealized)
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import CarbonPrice, Transaction, get_db

router = APIRouter(prefix="/portfolio", tags=["Portfolio Manager"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TransactionCreate(BaseModel):
    transaction_type: str  = Field(..., pattern="^(buy|sell)$", examples=["buy"])
    market:           str  = Field(..., examples=["EU ETS"])
    quantity:         float = Field(..., gt=0, description="Metric tons of CO₂")
    price_per_unit:   float = Field(..., gt=0, description="USD per metric ton")
    notes:            Optional[str] = None

    @model_validator(mode="after")
    def normalise_type(self):
        self.transaction_type = self.transaction_type.lower()
        return self


class TransactionOut(BaseModel):
    id:               int
    transaction_type: str
    market:           str
    quantity:         float
    price_per_unit:   float
    total_value:      float
    date:             datetime
    notes:            Optional[str]

    model_config = {"from_attributes": True}


class Holding(BaseModel):
    market:            str
    quantity:          float          # metric tons currently held
    avg_cost:          float          # USD / metric ton (weighted average)
    total_cost_basis:  float          # USD
    current_price:     Optional[float]
    current_value:     Optional[float]
    unrealized_pnl:    Optional[float]
    unrealized_pnl_pct: Optional[float]


class PnLSummary(BaseModel):
    total_invested:       float
    total_proceeds:       float
    realized_pnl:         float
    unrealized_pnl:       float
    total_pnl:            float
    holdings:             list[Holding]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _latest_price(db: Session, market: str) -> Optional[float]:
    row = (
        db.query(CarbonPrice)
        .filter(CarbonPrice.market == market)
        .order_by(desc(CarbonPrice.date))
        .first()
    )
    return row.close if row else None


def _compute_holdings(transactions: list[Transaction], db: Session) -> list[Holding]:
    """
    Uses average cost method per market.
    Sells reduce quantity and generate realized P&L.
    """
    from collections import defaultdict

    # {market: {total_qty, total_cost, realized_pnl}}
    state: dict[str, dict] = defaultdict(lambda: {
        "buy_qty": 0.0, "buy_cost": 0.0, "sell_proceeds": 0.0, "sell_qty": 0.0
    })

    for tx in sorted(transactions, key=lambda t: t.date):
        s = state[tx.market]
        if tx.transaction_type == "buy":
            s["buy_qty"]  += tx.quantity
            s["buy_cost"] += tx.total_value
        else:  # sell
            s["sell_qty"]      += tx.quantity
            s["sell_proceeds"] += tx.total_value

    holdings = []
    for market, s in state.items():
        net_qty = round(s["buy_qty"] - s["sell_qty"], 4)
        if net_qty < 0:
            net_qty = 0.0  # shouldn't happen but guard anyway
        avg_cost = (s["buy_cost"] / s["buy_qty"]) if s["buy_qty"] else 0.0

        current_price = _latest_price(db, market)
        if current_price and net_qty > 0:
            current_value = round(net_qty * current_price, 2)
            unrealized_pnl = round(current_value - (net_qty * avg_cost), 2)
            unrealized_pnl_pct = round(unrealized_pnl / (net_qty * avg_cost) * 100, 2) if avg_cost else 0.0
        else:
            current_value = unrealized_pnl = unrealized_pnl_pct = None

        holdings.append(Holding(
            market=market,
            quantity=net_qty,
            avg_cost=round(avg_cost, 4),
            total_cost_basis=round(net_qty * avg_cost, 2),
            current_price=current_price,
            current_value=current_value,
            unrealized_pnl=unrealized_pnl,
            unrealized_pnl_pct=unrealized_pnl_pct,
        ))

    return holdings


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/transactions", response_model=TransactionOut, status_code=201,
             summary="Log a buy or sell transaction")
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    # validate: can't sell more than you hold
    if payload.transaction_type == "sell":
        txns = db.query(Transaction).filter(Transaction.market == payload.market).all()
        held = sum(
            t.quantity if t.transaction_type == "buy" else -t.quantity
            for t in txns
        )
        if payload.quantity > held:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot sell {payload.quantity} tons — you only hold {held:.2f} tons of {payload.market}."
            )

    tx = Transaction(
        transaction_type=payload.transaction_type,
        market=payload.market,
        quantity=payload.quantity,
        price_per_unit=payload.price_per_unit,
        total_value=round(payload.quantity * payload.price_per_unit, 2),
        notes=payload.notes,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get("/transactions", response_model=list[TransactionOut],
            summary="List all transactions")
def list_transactions(
    market:           Optional[str] = Query(None),
    transaction_type: Optional[str] = Query(None, pattern="^(buy|sell)$"),
    limit:            int           = Query(200, ge=1, le=1000),
    offset:           int           = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if market:
        q = q.filter(Transaction.market == market)
    if transaction_type:
        q = q.filter(Transaction.transaction_type == transaction_type)
    return q.order_by(desc(Transaction.date)).offset(offset).limit(limit).all()


@router.delete("/transactions/{transaction_id}", status_code=204,
               summary="Remove a transaction by ID")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()


@router.get("/holdings", response_model=list[Holding],
            summary="Current holdings per market (mark-to-market)")
def get_holdings(db: Session = Depends(get_db)):
    txns = db.query(Transaction).all()
    return _compute_holdings(txns, db)


@router.get("/pnl", response_model=PnLSummary,
            summary="Full P&L summary — realized + unrealized")
def get_pnl(db: Session = Depends(get_db)):
    txns = db.query(Transaction).all()
    holdings = _compute_holdings(txns, db)

    total_invested  = sum(t.total_value for t in txns if t.transaction_type == "buy")
    total_proceeds  = sum(t.total_value for t in txns if t.transaction_type == "sell")

    # Realized P&L: proceeds minus cost basis of what was sold
    # Using per-market avg cost to determine cost of sold units
    from collections import defaultdict
    mkt_state: dict[str, dict] = defaultdict(lambda: {"buy_qty": 0.0, "buy_cost": 0.0})
    realized = 0.0
    for tx in sorted(txns, key=lambda t: t.date):
        s = mkt_state[tx.market]
        if tx.transaction_type == "buy":
            s["buy_qty"]  += tx.quantity
            s["buy_cost"] += tx.total_value
        else:
            avg = (s["buy_cost"] / s["buy_qty"]) if s["buy_qty"] else 0.0
            realized += tx.total_value - (tx.quantity * avg)

    unrealized = sum(h.unrealized_pnl for h in holdings if h.unrealized_pnl is not None)

    return PnLSummary(
        total_invested=round(total_invested, 2),
        total_proceeds=round(total_proceeds, 2),
        realized_pnl=round(realized, 2),
        unrealized_pnl=round(unrealized, 2),
        total_pnl=round(realized + unrealized, 2),
        holdings=holdings,
    )
