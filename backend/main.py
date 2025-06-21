# main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
import yfinance as yf
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio

# Load environment variables
load_dotenv()

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cleartrack.db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models
class Holding(Base):
    __tablename__ = "holdings"
    
    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, index=True)
    shares = Column(Float)
    purchase_price = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    snapshots = relationship("PriceSnapshot", back_populates="holding")

class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    holding_id = Column(Integer, ForeignKey("holdings.id"))
    price = Column(Float)
    date = Column(DateTime, default=datetime.utcnow)
    
    holding = relationship("Holding", back_populates="snapshots")

class PortfolioHistory(Base):
    __tablename__ = "portfolio_history"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.utcnow)
    total_value = Column(Float)
    total_invested = Column(Float)
    profit_loss = Column(Float)

# Create tables
Base.metadata.create_all(bind=engine)

# Pydantic models
class HoldingCreate(BaseModel):
    ticker: str
    shares: float
    purchase_price: float

class HoldingResponse(BaseModel):
    id: int
    ticker: str
    shares: float
    purchase_price: float
    current_price: float
    current_value: float
    total_cost: float
    created_at: datetime
    
    class Config:
        from_attributes = True

class PortfolioSummary(BaseModel):
    total_invested: float
    current_value: float
    holdings_count: int
    profit_loss: float
    profit_loss_percent: float

class PortfolioHistoryResponse(BaseModel):
    date: str
    profit_loss: float

# FastAPI app
app = FastAPI(title="ClearTrack API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://cleartrack.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper functions
def get_current_price(ticker: str) -> float:
    """Fetch current stock price using yfinance"""
    try:
        stock = yf.Ticker(ticker)
        data = stock.history(period="1d")
        if not data.empty:
            return float(data['Close'].iloc[-1])
        return 0.0
    except Exception:
        return 0.0

async def update_price_snapshots():
    """Daily job to update price snapshots"""
    db = SessionLocal()
    try:
        holdings = db.query(Holding).all()
        portfolio_value = 0
        portfolio_invested = 0
        
        for holding in holdings:
            current_price = get_current_price(holding.ticker)
            
            # Create price snapshot
            snapshot = PriceSnapshot(
                holding_id=holding.id,
                price=current_price,
                date=datetime.utcnow()
            )
            db.add(snapshot)
            
            # Calculate portfolio totals
            portfolio_value += current_price * holding.shares
            portfolio_invested += holding.purchase_price * holding.shares
        
        # Create portfolio history entry
        history = PortfolioHistory(
            date=datetime.utcnow(),
            total_value=portfolio_value,
            total_invested=portfolio_invested,
            profit_loss=portfolio_value - portfolio_invested
        )
        db.add(history)
        db.commit()
        
    except Exception as e:
        print(f"Error updating snapshots: {e}")
    finally:
        db.close()

# Schedule daily snapshots
scheduler = AsyncIOScheduler()
scheduler.add_job(update_price_snapshots, 'cron', hour=16, minute=0)  # 4 PM daily
scheduler.start()

# API Routes
@app.get("/")
def read_root():
    return {"message": "ClearTrack API is running"}

@app.get("/api/holdings", response_model=List[HoldingResponse])
def get_holdings(db: Session = Depends(get_db)):
    holdings = db.query(Holding).all()
    response = []
    
    for holding in holdings:
        current_price = get_current_price(holding.ticker)
        response.append(HoldingResponse(
            id=holding.id,
            ticker=holding.ticker,
            shares=holding.shares,
            purchase_price=holding.purchase_price,
            current_price=current_price,
            current_value=current_price * holding.shares,
            total_cost=holding.purchase_price * holding.shares,
            created_at=holding.created_at
        ))
    
    return response

@app.post("/api/holdings", response_model=HoldingResponse)
def create_holding(holding: HoldingCreate, db: Session = Depends(get_db)):
    # Verify ticker exists
    current_price = get_current_price(holding.ticker)
    if current_price == 0:
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")
    
    db_holding = Holding(**holding.dict())
    db.add(db_holding)
    db.commit()
    db.refresh(db_holding)
    
    return HoldingResponse(
        id=db_holding.id,
        ticker=db_holding.ticker,
        shares=db_holding.shares,
        purchase_price=db_holding.purchase_price,
        current_price=current_price,
        current_value=current_price * db_holding.shares,
        total_cost=db_holding.purchase_price * db_holding.shares,
        created_at=db_holding.created_at
    )

@app.delete("/api/holdings/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    holding = db.query(Holding).filter(Holding.id == holding_id).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    
    db.delete(holding)
    db.commit()
    return {"message": "Holding deleted"}

@app.get("/api/portfolio/summary", response_model=PortfolioSummary)
def get_portfolio_summary(db: Session = Depends(get_db)):
    holdings = db.query(Holding).all()
    
    total_invested = 0
    current_value = 0
    
    for holding in holdings:
        current_price = get_current_price(holding.ticker)
        total_invested += holding.purchase_price * holding.shares
        current_value += current_price * holding.shares
    
    profit_loss = current_value - total_invested
    profit_loss_percent = (profit_loss / total_invested * 100) if total_invested > 0 else 0
    
    return PortfolioSummary(
        total_invested=total_invested,
        current_value=current_value,
        holdings_count=len(holdings),
        profit_loss=profit_loss,
        profit_loss_percent=profit_loss_percent
    )

@app.get("/api/portfolio/history", response_model=List[PortfolioHistoryResponse])
def get_portfolio_history(db: Session = Depends(get_db)):
    # Get last 30 days of history
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    history = db.query(PortfolioHistory).filter(
        PortfolioHistory.date >= thirty_days_ago
    ).order_by(PortfolioHistory.date).all()
    
    return [
        PortfolioHistoryResponse(
            date=entry.date.strftime("%Y-%m-%d"),
            profit_loss=entry.profit_loss
        )
        for entry in history
    ]

@app.get("/api/prices/current/{ticker}")
def get_current_stock_price(ticker: str):
    price = get_current_price(ticker.upper())
    if price == 0:
        raise HTTPException(status_code=404, detail="Ticker not found")
    
    return {"ticker": ticker.upper(), "price": price}

@app.post("/api/prices/snapshot")
async def trigger_snapshot():
    """Manually trigger a price snapshot"""
    await update_price_snapshots()
    return {"message": "Snapshot completed"}

# Run with: uvicorn main:app --reload --port 8000