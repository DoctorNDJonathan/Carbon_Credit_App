"""
routes/footprint.py
-------------------
Carbon Footprint Calculator endpoints.

POST /footprint/calculate  – compute CO₂ emissions and recommend credits
GET  /footprint/history    – list saved calculation records
GET  /footprint/{id}       – retrieve a single saved calculation
DELETE /footprint/{id}     – delete a saved calculation

Emission factors used (conservative, industry-standard sources):
  Electricity  : 0.386 kg CO₂e / kWh   (US EPA eGRID 2023 national avg)
  Natural gas  : 53.06 kg CO₂e / MMBtu  (US EPA)
  Air travel   : 0.255 kg CO₂e / km     (ICAO per passenger, economy)
  Road travel  : 0.21  kg CO₂e / km     (avg ICE car, EPA)
  Manufacturing: varies by type (see MANUFACTURING_FACTORS below)
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import CarbonPrice, FootprintCalculation, get_db

router = APIRouter(prefix="/footprint", tags=["Carbon Footprint Calculator"])

# ---------------------------------------------------------------------------
# Emission factors
# ---------------------------------------------------------------------------

ELECTRICITY_KG_PER_KWH    = 0.386
NATURAL_GAS_KG_PER_MMBTU  = 53.06
AIR_TRAVEL_KG_PER_KM      = 0.255
ROAD_TRAVEL_KG_PER_KM     = 0.21

# kg CO₂e per manufactured unit — rough sectoral averages
MANUFACTURING_FACTORS: dict[str, float] = {
    "general":      10.0,
    "steel":       1_850.0,   # per metric ton
    "cement":        900.0,   # per metric ton
    "aluminum":    11_500.0,  # per metric ton
    "plastic":       2_500.0, # per metric ton
    "electronics":    150.0,  # per device
    "textile":         8.0,   # per kg of fabric
    "food":            2.5,   # per kg of food product
    "chemical":      500.0,   # per metric ton
    "paper":         700.0,   # per metric ton
}

AVAILABLE_MANUFACTURING_TYPES = list(MANUFACTURING_FACTORS.keys())


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class FootprintInput(BaseModel):
    company_name:        str   = Field("", description="Optional company/department label")
    electricity_kwh:     float = Field(0.0, ge=0, description="Monthly electricity use (kWh)")
    natural_gas_mmbtu:   float = Field(0.0, ge=0, description="Monthly natural gas use (MMBtu)")
    air_travel_km:       float = Field(0.0, ge=0, description="Monthly total air travel (km, all staff)")
    road_travel_km:      float = Field(0.0, ge=0, description="Monthly total road travel (km, all vehicles)")
    manufacturing_units: float = Field(0.0, ge=0, description="Monthly manufactured units or weight (see type)")
    manufacturing_type:  str   = Field("general", description=f"One of: {AVAILABLE_MANUFACTURING_TYPES}")


class FootprintResult(BaseModel):
    id:                      int
    created_at:              datetime
    company_name:            str

    # inputs echoed back
    electricity_kwh:         float
    natural_gas_mmbtu:       float
    air_travel_km:           float
    road_travel_km:          float
    manufacturing_units:     float
    manufacturing_type:      str

    # per-source breakdown (metric tons CO₂e / month)
    electricity_co2_tons:    float
    natural_gas_co2_tons:    float
    air_travel_co2_tons:     float
    road_travel_co2_tons:    float
    manufacturing_co2_tons:  float

    # totals
    total_co2_tons:          float   # monthly
    annual_co2_tons:         float

    # recommendations
    recommended_credits:     int     # metric tons to offset (= ceil(total_co2_tons))
    estimated_cost_usd:      float   # at voluntary market price
    offset_market:           str
    offset_price_used:       float

    model_config = {"from_attributes": True}


class ManufacturingTypesOut(BaseModel):
    types: list[str]
    factors_kg_per_unit: dict[str, float]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _latest_voluntary_price(db: Session) -> tuple[float, str]:
    """Return (price, market_name) for the cheapest available market."""
    # Try Voluntary first, fall back to cheapest available
    for preferred in ("Voluntary", "California CCA", "EU ETS"):
        row = (
            db.query(CarbonPrice)
            .filter(CarbonPrice.market == preferred)
            .order_by(desc(CarbonPrice.date))
            .first()
        )
        if row:
            return row.close, row.market
    return 12.0, "Voluntary (default)"   # absolute fallback


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/manufacturing-types", response_model=ManufacturingTypesOut,
            summary="List supported manufacturing types and their emission factors")
def manufacturing_types():
    return ManufacturingTypesOut(
        types=AVAILABLE_MANUFACTURING_TYPES,
        factors_kg_per_unit=MANUFACTURING_FACTORS,
    )


@router.post("/calculate", response_model=FootprintResult, status_code=201,
             summary="Calculate monthly CO₂ footprint and credit recommendation")
def calculate_footprint(payload: FootprintInput, db: Session = Depends(get_db)):
    mfg_type = payload.manufacturing_type.lower()
    if mfg_type not in MANUFACTURING_FACTORS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown manufacturing type '{mfg_type}'. Valid types: {AVAILABLE_MANUFACTURING_TYPES}"
        )

    # Compute each source in metric tons (divide kg by 1000)
    elec_co2  = round(payload.electricity_kwh   * ELECTRICITY_KG_PER_KWH   / 1_000, 4)
    gas_co2   = round(payload.natural_gas_mmbtu  * NATURAL_GAS_KG_PER_MMBTU / 1_000, 4)
    air_co2   = round(payload.air_travel_km      * AIR_TRAVEL_KG_PER_KM     / 1_000, 4)
    road_co2  = round(payload.road_travel_km     * ROAD_TRAVEL_KG_PER_KM    / 1_000, 4)
    mfg_co2   = round(payload.manufacturing_units * MANUFACTURING_FACTORS[mfg_type] / 1_000, 4)

    total_co2 = round(elec_co2 + gas_co2 + air_co2 + road_co2 + mfg_co2, 4)
    annual_co2 = round(total_co2 * 12, 2)

    import math
    recommended_credits = math.ceil(total_co2)   # round up to nearest whole ton

    price, market_name = _latest_voluntary_price(db)
    estimated_cost = round(recommended_credits * price, 2)

    record = FootprintCalculation(
        company_name=payload.company_name,
        electricity_kwh=payload.electricity_kwh,
        natural_gas_mmbtu=payload.natural_gas_mmbtu,
        air_travel_km=payload.air_travel_km,
        road_travel_km=payload.road_travel_km,
        manufacturing_units=payload.manufacturing_units,
        manufacturing_type=mfg_type,
        electricity_co2_tons=elec_co2,
        natural_gas_co2_tons=gas_co2,
        air_travel_co2_tons=air_co2,
        road_travel_co2_tons=road_co2,
        manufacturing_co2_tons=mfg_co2,
        total_co2_tons=total_co2,
        recommended_credits=recommended_credits,
        estimated_cost_usd=estimated_cost,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return FootprintResult(
        **{c.name: getattr(record, c.name) for c in record.__table__.columns},
        annual_co2_tons=annual_co2,
        offset_market=market_name,
        offset_price_used=price,
    )


@router.get("/history", response_model=list[FootprintResult],
            summary="List past footprint calculations")
def footprint_history(
    limit:  int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    records = (
        db.query(FootprintCalculation)
        .order_by(desc(FootprintCalculation.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    price, market_name = _latest_voluntary_price(db)
    return [
        FootprintResult(
            **{c.name: getattr(r, c.name) for c in r.__table__.columns},
            annual_co2_tons=round(r.total_co2_tons * 12, 2),
            offset_market=market_name,
            offset_price_used=price,
        )
        for r in records
    ]


@router.get("/{calculation_id}", response_model=FootprintResult,
            summary="Retrieve a single footprint calculation")
def get_footprint(calculation_id: int, db: Session = Depends(get_db)):
    record = db.get(FootprintCalculation, calculation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Calculation not found")
    price, market_name = _latest_voluntary_price(db)
    return FootprintResult(
        **{c.name: getattr(record, c.name) for c in record.__table__.columns},
        annual_co2_tons=round(record.total_co2_tons * 12, 2),
        offset_market=market_name,
        offset_price_used=price,
    )


@router.delete("/{calculation_id}", status_code=204,
               summary="Delete a footprint calculation record")
def delete_footprint(calculation_id: int, db: Session = Depends(get_db)):
    record = db.get(FootprintCalculation, calculation_id)
    if not record:
        raise HTTPException(status_code=404, detail="Calculation not found")
    db.delete(record)
    db.commit()
