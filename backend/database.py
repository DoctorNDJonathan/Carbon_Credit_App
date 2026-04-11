"""
database.py
-----------
Defines all SQLAlchemy ORM models and the database engine/session factory.
Also contains seed_database() which populates 6 months of realistic carbon
credit price history the first time the app starts.

Tables:
  carbon_prices          – daily OHLCV-style price snapshots per market
  transactions           – portfolio buy/sell ledger
  footprint_calculations – saved CO2 footprint audit records
"""

import random
from datetime import date, datetime, timedelta

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = "sqlite:///./carbon_credits.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite + FastAPI
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CarbonPrice(Base):
    """
    One row per (market, date) pair.
    Markets: "EU ETS", "California CCA", "Voluntary"
    """
    __tablename__ = "carbon_prices"

    id         = Column(Integer, primary_key=True, index=True)
    market     = Column(String(64), nullable=False, index=True)
    date       = Column(Date, nullable=False, index=True)
    open_price = Column(Float, nullable=False)
    high_price = Column(Float, nullable=False)
    low_price  = Column(Float, nullable=False)
    close      = Column(Float, nullable=False)   # the headline "price"
    volume     = Column(Integer, nullable=False)  # metric tons traded


class Transaction(Base):
    """
    Buy or sell entry in a user's portfolio.
    type: "buy" | "sell"
    """
    __tablename__ = "transactions"

    id             = Column(Integer, primary_key=True, index=True)
    transaction_type = Column(String(4), nullable=False)   # "buy" | "sell"
    market         = Column(String(64), nullable=False)
    quantity       = Column(Float, nullable=False)          # metric tons
    price_per_unit = Column(Float, nullable=False)          # USD / metric ton
    total_value    = Column(Float, nullable=False)          # quantity * price_per_unit
    date           = Column(DateTime, default=datetime.utcnow)
    notes          = Column(Text, nullable=True)


class FootprintCalculation(Base):
    """
    Persisted record of each CO2 footprint calculation submitted by a user.
    Inputs are stored alongside the computed outputs so the history endpoint
    can replay them without recalculating.
    """
    __tablename__ = "footprint_calculations"

    id                  = Column(Integer, primary_key=True, index=True)
    created_at          = Column(DateTime, default=datetime.utcnow)

    # --- inputs ---
    company_name        = Column(String(128), nullable=True)
    electricity_kwh     = Column(Float, default=0.0)   # kWh / month
    natural_gas_mmbtu   = Column(Float, default=0.0)   # MMBtu / month
    air_travel_km       = Column(Float, default=0.0)   # km / month
    road_travel_km      = Column(Float, default=0.0)   # km / month
    manufacturing_units = Column(Float, default=0.0)   # units / month
    manufacturing_type  = Column(String(64), default="general")

    # --- outputs ---
    electricity_co2_tons    = Column(Float)
    natural_gas_co2_tons    = Column(Float)
    air_travel_co2_tons     = Column(Float)
    road_travel_co2_tons    = Column(Float)
    manufacturing_co2_tons  = Column(Float)
    total_co2_tons          = Column(Float)
    recommended_credits     = Column(Integer)
    estimated_cost_usd      = Column(Float)


# ---------------------------------------------------------------------------
# Dependency injected into every route
# ---------------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Seed helper
# ---------------------------------------------------------------------------

def _random_walk(start: float, days: int, rng: random.Random,
                 drift: float = 0.0002, volatility: float = 0.015) -> list[float]:
    """
    Geometric Brownian-motion style price walk.
    drift     : daily upward/downward trend (0 = flat)
    volatility: daily standard deviation as fraction of price
    """
    prices = [start]
    for _ in range(days - 1):
        change = rng.gauss(drift, volatility)
        prices.append(round(prices[-1] * (1 + change), 2))
    return prices


def seed_database(db: Session) -> None:
    """
    Populate 6 months of weekday price history for three markets if the
    carbon_prices table is empty.  Uses a fixed random seed so the data is
    deterministic across restarts.
    """
    if db.query(CarbonPrice).first():
        return  # already seeded

    rng = random.Random(42)

    # Market config: (display name, start price USD/ton, drift, volatility)
    markets = [
        ("EU ETS",         78.50, 0.0003,  0.018),
        ("California CCA", 34.20, 0.0001,  0.012),
        ("Voluntary",      11.80, -0.0001, 0.022),
    ]

    end_date   = date.today()
    start_date = end_date - timedelta(days=183)   # ~6 months

    for market_name, start_price, drift, vol in markets:
        # collect only weekdays
        weekdays = [
            start_date + timedelta(days=d)
            for d in range((end_date - start_date).days + 1)
            if (start_date + timedelta(days=d)).weekday() < 5
        ]

        closes = _random_walk(start_price, len(weekdays), rng, drift, vol)

        for i, day in enumerate(weekdays):
            close = closes[i]
            spread = close * rng.uniform(0.005, 0.015)
            high   = round(close + spread, 2)
            low    = round(close - spread, 2)
            open_  = round(low + rng.random() * (high - low), 2)

            # Volume: rough daily metric-ton equivalent per market
            base_vol = {"EU ETS": 180_000, "California CCA": 95_000, "Voluntary": 40_000}
            volume = int(base_vol[market_name] * rng.uniform(0.6, 1.4))

            db.add(CarbonPrice(
                market=market_name,
                date=day,
                open_price=open_,
                high_price=high,
                low_price=low,
                close=close,
                volume=volume,
            ))

    db.commit()
    print("✓ Database seeded with 6 months of carbon credit price history.")


# ---------------------------------------------------------------------------
# Create tables on import (safe to call multiple times)
# ---------------------------------------------------------------------------

def init_db() -> None:
    Base.metadata.create_all(bind=engine)
