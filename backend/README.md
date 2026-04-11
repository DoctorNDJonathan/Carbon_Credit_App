# Carbon Credit Analytics — Backend

A FastAPI backend for a corporate carbon credit platform with four core modules:
price tracking, portfolio management, CO₂ footprint calculation, and AI forecasting.

---

## Tech Stack

| Layer       | Technology            |
|-------------|-----------------------|
| Framework   | FastAPI               |
| Database    | SQLite (via SQLAlchemy ORM) |
| AI          | Anthropic Claude API  |
| Server      | Uvicorn               |

---

## Quick Start

### 1. Create and activate a virtual environment

```bash
python -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env and paste your Anthropic API key
```

Get a key at <https://console.anthropic.com/>.

### 4. Run the server

```bash
uvicorn main:app --reload --port 8000
```

The first run will:
- Create `carbon_credits.db` (SQLite file, auto-generated)
- Seed ~130 weekdays of price history across three markets (EU ETS, California CCA, Voluntary)

### 5. Open the interactive API docs

- Swagger UI → <http://localhost:8000/docs>
- ReDoc → <http://localhost:8000/redoc>

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Price Tracker — `/api/v1/prices`

| Method | Path                          | Description                          |
|--------|-------------------------------|--------------------------------------|
| GET    | `/prices/markets`             | List available markets               |
| GET    | `/prices/latest`              | Latest close price + day change %    |
| GET    | `/prices/summary`             | 52-week high/low/avg per market      |
| GET    | `/prices/`                    | Paginated OHLCV history (filterable) |
| GET    | `/prices/{market}/history`    | Full history for one market          |
| POST   | `/prices/`                    | Insert a manual price record         |

Query params for `GET /prices/`: `market`, `start` (date), `end` (date), `limit`, `offset`

---

### Portfolio Manager — `/api/v1/portfolio`

| Method | Path                                   | Description                     |
|--------|----------------------------------------|---------------------------------|
| POST   | `/portfolio/transactions`              | Log a buy or sell               |
| GET    | `/portfolio/transactions`              | List all transactions           |
| DELETE | `/portfolio/transactions/{id}`         | Remove a transaction            |
| GET    | `/portfolio/holdings`                  | Current holdings (mark-to-mkt)  |
| GET    | `/portfolio/pnl`                       | Full P&L summary                |

**Example — log a buy:**
```json
POST /api/v1/portfolio/transactions
{
  "transaction_type": "buy",
  "market": "EU ETS",
  "quantity": 500,
  "price_per_unit": 74.20,
  "notes": "Q2 offset purchase"
}
```

P&L uses the **average cost method** per market.  
Realized P&L is booked when you sell.  
Unrealized P&L marks open positions at the latest available market price.

---

### Carbon Footprint Calculator — `/api/v1/footprint`

| Method | Path                          | Description                             |
|--------|-------------------------------|-----------------------------------------|
| GET    | `/footprint/manufacturing-types` | Supported manufacturing categories   |
| POST   | `/footprint/calculate`        | Calculate monthly CO₂ and credit needs |
| GET    | `/footprint/history`          | Past calculations                       |
| GET    | `/footprint/{id}`             | Single calculation record               |
| DELETE | `/footprint/{id}`             | Delete a record                         |

**Emission factors used:**

| Source          | Factor                        |
|-----------------|-------------------------------|
| Electricity     | 0.386 kg CO₂e / kWh           |
| Natural gas     | 53.06 kg CO₂e / MMBtu         |
| Air travel      | 0.255 kg CO₂e / passenger-km  |
| Road travel     | 0.21 kg CO₂e / km             |
| Manufacturing   | varies by type (see API)      |

**Example request:**
```json
POST /api/v1/footprint/calculate
{
  "company_name": "Acme Corp — Chicago HQ",
  "electricity_kwh": 85000,
  "natural_gas_mmbtu": 420,
  "air_travel_km": 120000,
  "road_travel_km": 30000,
  "manufacturing_units": 0,
  "manufacturing_type": "general"
}
```

The response includes a `recommended_credits` count and an `estimated_cost_usd`
based on the current Voluntary market price fetched from the database.

---

### AI Forecasting — `/api/v1/forecasting`

| Method | Path                       | Description                          |
|--------|----------------------------|--------------------------------------|
| GET    | `/forecasting/markets`     | Markets available for forecasting    |
| POST   | `/forecasting/predict`     | Generate a Claude-powered forecast   |

**Example request:**
```json
POST /api/v1/forecasting/predict
{
  "market": "EU ETS",
  "days_ahead": 30
}
```

**What gets sent to Claude:**
- Last 30 trading days of OHLCV data
- 52-week high / low / average
- 5-day and 20-day moving averages

**What Claude returns (structured JSON):**
- Price targets with low/mid/high ranges for 1-week, 2-week, and 1-month horizons
- Trend classification (bullish / bearish / neutral)
- Confidence level
- Recommendation (buy / sell / hold)
- Key market drivers and risk factors

> Requires `ANTHROPIC_API_KEY` in `.env`.

---

## Project Structure

```
backend/
├── main.py              # FastAPI app, CORS, startup lifespan
├── database.py          # SQLAlchemy models, engine, seed function
├── requirements.txt
├── .env.example
├── README.md
└── routes/
    ├── prices.py        # Price Tracker
    ├── portfolio.py     # Portfolio Manager
    ├── footprint.py     # Footprint Calculator
    └── forecasting.py   # AI Forecasting (Claude)
```

---

## Database

SQLite file is created automatically at `./carbon_credits.db`.  
No migration tool is needed — `SQLAlchemy` creates tables on startup.

To reset the database and re-seed:
```bash
rm carbon_credits.db
uvicorn main:app --reload
```

---

## Development Notes

- CORS is configured for `localhost:3000` (CRA) and `localhost:5173` (Vite).  
  Update `allow_origins` in `main.py` before deploying.
- The AI forecasting endpoint uses `claude-sonnet-4-6` by default. The model can be
  changed in `routes/forecasting.py`.
- The seed function is deterministic (fixed `random.Random(42)`) — the same price
  history is generated on every fresh database.
