import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Plus, X, Loader } from 'lucide-react';

// API Service
// On Vercel the API is served from the same domain so the default is empty
const API_URL = process.env.REACT_APP_API_URL || '';

const api = {
  async getHoldings() {
    const res = await fetch(`${API_URL}/api/holdings`);
    return res.json();
  },
  
  async addHolding(data) {
    const res = await fetch(`${API_URL}/api/holdings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async deleteHolding(id) {
    await fetch(`${API_URL}/api/holdings/${id}`, { method: 'DELETE' });
  },
  
  async getPortfolioSummary() {
    const res = await fetch(`${API_URL}/api/portfolio/summary`);
    return res.json();
  },
  
  async getPortfolioHistory() {
    const res = await fetch(`${API_URL}/api/portfolio/history`);
    return res.json();
  },
  
  async getCurrentPrice(ticker) {
    const res = await fetch(`${API_URL}/api/prices/current/${ticker}`);
    return res.json();
  }
};

// Utility functions
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

const formatPercent = (percent) => {
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
};

// Components
const HoldingCard = ({ holding, onDelete }) => {
  const profitLoss = holding.current_value - holding.total_cost;
  const profitLossPercent = ((holding.current_value - holding.total_cost) / holding.total_cost) * 100;
  const isProfit = profitLoss >= 0;

  return (
    <div className="holding-card">
      <div className="holding-header">
        <div>
          <h3>{holding.ticker}</h3>
          <p className="holding-shares">{holding.shares} shares @ {formatCurrency(holding.purchase_price)}</p>
        </div>
        <button className="delete-btn" onClick={() => onDelete(holding.id)}>
          <X size={18} />
        </button>
      </div>
      
      <div className="holding-metrics">
        <div className="metric">
          <span className="metric-label">Current Value</span>
          <span className="metric-value">{formatCurrency(holding.current_value)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Profit/Loss</span>
          <span className={`metric-value ${isProfit ? 'profit' : 'loss'}`}>
            {formatCurrency(profitLoss)}
            <span className="metric-percent">{formatPercent(profitLossPercent)}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

const AddHoldingForm = ({ onAdd, onCancel }) => {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Verify ticker exists
      const priceData = await api.getCurrentPrice(ticker.toUpperCase());
      if (!priceData.price) {
        throw new Error('Invalid ticker symbol');
      }

      await onAdd({
        ticker: ticker.toUpperCase(),
        shares: parseFloat(shares),
        purchase_price: parseFloat(purchasePrice)
      });

      // Reset form
      setTicker('');
      setShares('');
      setPurchasePrice('');
    } catch (err) {
      setError(err.message || 'Failed to add holding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-holding-form">
      <h3>Add New Holding</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Stock Ticker</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="AAPL"
            required
            maxLength="5"
          />
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>Number of Shares</label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="10"
              required
              step="0.001"
              min="0.001"
            />
          </div>
          
          <div className="form-group">
            <label>Purchase Price</label>
            <input
              type="number"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              placeholder="150.00"
              required
              step="0.01"
              min="0.01"
            />
          </div>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="form-actions">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader className="spinner" size={16} /> : 'Add Holding'}
          </button>
        </div>
      </form>
    </div>
  );
};

const PortfolioSummary = ({ summary }) => {
  const profitLoss = summary.current_value - summary.total_invested;
  const profitLossPercent = ((summary.current_value - summary.total_invested) / summary.total_invested) * 100;
  const isProfit = profitLoss >= 0;

  return (
    <div className="portfolio-summary">
      <div className="summary-main">
        <h2>Total Portfolio Value</h2>
        <div className="total-value">{formatCurrency(summary.current_value)}</div>
        <div className={`profit-loss-summary ${isProfit ? 'profit' : 'loss'}`}>
          {isProfit ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          <span>{formatCurrency(Math.abs(profitLoss))}</span>
          <span className="percent">{formatPercent(profitLossPercent)}</span>
        </div>
      </div>
      
      <div className="summary-metrics">
        <div className="summary-metric">
          <span className="label">Total Invested</span>
          <span className="value">{formatCurrency(summary.total_invested)}</span>
        </div>
        <div className="summary-metric">
          <span className="label">Number of Holdings</span>
          <span className="value">{summary.holdings_count}</span>
        </div>
      </div>
    </div>
  );
};

const PortfolioChart = ({ history }) => {
  if (!history || history.length === 0) {
    return (
      <div className="chart-container empty">
        <p>No historical data yet. Check back tomorrow!</p>
      </div>
    );
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const chartData = history.map(point => ({
    date: formatDate(point.date),
    value: point.profit_loss
  }));

  return (
    <div className="chart-container">
      <h3>Profit/Loss Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" stroke="#666" />
          <YAxis stroke="#666" tickFormatter={(value) => `$${value}`} />
          <Tooltip 
            formatter={(value) => formatCurrency(value)}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#4F46E5" 
            strokeWidth={2}
            dot={{ fill: '#4F46E5', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Main App Component
export default function App() {
  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState({
    total_invested: 0,
    current_value: 0,
    holdings_count: 0
  });
  const [history, setHistory] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mock data for demonstration
  useEffect(() => {
    // In production, these would be real API calls
    const mockHoldings = [
      {
        id: 1,
        ticker: 'AAPL',
        shares: 10,
        purchase_price: 150,
        current_price: 175,
        current_value: 1750,
        total_cost: 1500
      },
      {
        id: 2,
        ticker: 'GOOGL',
        shares: 5,
        purchase_price: 2500,
        current_price: 2800,
        current_value: 14000,
        total_cost: 12500
      }
    ];

    const mockSummary = {
      total_invested: 14000,
      current_value: 15750,
      holdings_count: 2
    };

    const mockHistory = [
      { date: '2024-01-01', profit_loss: 0 },
      { date: '2024-02-01', profit_loss: 500 },
      { date: '2024-03-01', profit_loss: 800 },
      { date: '2024-04-01', profit_loss: 1200 },
      { date: '2024-05-01', profit_loss: 1750 }
    ];

    setTimeout(() => {
      setHoldings(mockHoldings);
      setSummary(mockSummary);
      setHistory(mockHistory);
      setLoading(false);
    }, 1000);
  }, []);

  const handleAddHolding = async (data) => {
    // In production, this would call the API
    const newHolding = {
      id: Date.now(),
      ...data,
      current_price: data.purchase_price * 1.1, // Mock current price
      current_value: data.shares * data.purchase_price * 1.1,
      total_cost: data.shares * data.purchase_price
    };
    
    setHoldings([...holdings, newHolding]);
    setShowAddForm(false);
    
    // Update summary
    setSummary(prev => ({
      total_invested: prev.total_invested + newHolding.total_cost,
      current_value: prev.current_value + newHolding.current_value,
      holdings_count: prev.holdings_count + 1
    }));
  };

  const handleDeleteHolding = async (id) => {
    const holding = holdings.find(h => h.id === id);
    setHoldings(holdings.filter(h => h.id !== id));
    
    // Update summary
    setSummary(prev => ({
      total_invested: prev.total_invested - holding.total_cost,
      current_value: prev.current_value - holding.current_value,
      holdings_count: prev.holdings_count - 1
    }));
  };

  if (loading) {
    return (
      <div className="loading-container">
        <Loader className="spinner" size={32} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>ClearTrack</h1>
        <p>Your calm space for investment tracking</p>
      </header>

      <main className="app-main">
        <PortfolioSummary summary={summary} />
        
        <PortfolioChart history={history} />

        <section className="holdings-section">
          <div className="section-header">
            <h2>Your Holdings</h2>
            {!showAddForm && (
              <button className="btn-primary" onClick={() => setShowAddForm(true)}>
                <Plus size={20} /> Add Holding
              </button>
            )}
          </div>

          {showAddForm && (
            <AddHoldingForm 
              onAdd={handleAddHolding}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          <div className="holdings-grid">
            {holdings.map(holding => (
              <HoldingCard 
                key={holding.id}
                holding={holding}
                onDelete={handleDeleteHolding}
              />
            ))}
          </div>

          {holdings.length === 0 && !showAddForm && (
            <div className="empty-state">
              <p>No holdings yet. Add your first investment to get started!</p>
            </div>
          )}
        </section>
      </main>

      <style jsx>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: #fafafa;
          color: #1a1a1a;
          line-height: 1.6;
        }

        .app {
          min-height: 100vh;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .app-header {
          text-align: center;
          margin-bottom: 40px;
        }

        .app-header h1 {
          font-size: 2.5rem;
          font-weight: 700;
          color: #4F46E5;
          margin-bottom: 8px;
        }

        .app-header p {
          color: #666;
          font-size: 1.1rem;
        }

        .portfolio-summary {
          background: white;
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 32px;
        }

        .summary-main {
          text-align: center;
          margin-bottom: 32px;
        }

        .summary-main h2 {
          font-size: 1rem;
          color: #666;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .total-value {
          font-size: 3rem;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 12px;
        }

        .profit-loss-summary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .profit-loss-summary.profit {
          color: #10b981;
        }

        .profit-loss-summary.loss {
          color: #ef4444;
        }

        .profit-loss-summary .percent {
          font-size: 1rem;
          opacity: 0.8;
        }

        .summary-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 24px;
          padding-top: 24px;
          border-top: 1px solid #e5e5e5;
        }

        .summary-metric {
          text-align: center;
        }

        .summary-metric .label {
          display: block;
          font-size: 0.875rem;
          color: #666;
          margin-bottom: 4px;
        }

        .summary-metric .value {
          display: block;
          font-size: 1.5rem;
          font-weight: 600;
          color: #1a1a1a;
        }

        .chart-container {
          background: white;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 32px;
        }

        .chart-container h3 {
          font-size: 1.25rem;
          margin-bottom: 16px;
          color: #1a1a1a;
        }

        .chart-container.empty {
          text-align: center;
          padding: 48px;
          color: #666;
        }

        .holdings-section {
          margin-top: 40px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .section-header h2 {
          font-size: 1.75rem;
          color: #1a1a1a;
        }

        .holdings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }

        .holding-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s;
        }

        .holding-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .holding-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 16px;
        }

        .holding-header h3 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 4px;
        }

        .holding-shares {
          font-size: 0.875rem;
          color: #666;
        }

        .holding-metrics {
          display: grid;
          gap: 16px;
        }

        .metric {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .metric-label {
          font-size: 0.875rem;
          color: #666;
        }

        .metric-value {
          font-size: 1.125rem;
          font-weight: 600;
          color: #1a1a1a;
        }

        .metric-value.profit {
          color: #10b981;
        }

        .metric-value.loss {
          color: #ef4444;
        }

        .metric-percent {
          font-size: 0.875rem;
          margin-left: 8px;
          opacity: 0.8;
        }

        .add-holding-form {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }

        .add-holding-form h3 {
          margin-bottom: 20px;
          color: #1a1a1a;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 0.875rem;
          color: #666;
          margin-bottom: 6px;
        }

        .form-group input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #4F46E5;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
        }

        .btn-primary, .btn-secondary {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary {
          background: #4F46E5;
          color: white;
        }

        .btn-primary:hover {
          background: #4338CA;
        }

        .btn-primary:disabled {
          background: #9CA3AF;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #f3f4f6;
          color: #666;
        }

        .btn-secondary:hover {
          background: #e5e7eb;
        }

        .delete-btn {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 4px;
          transition: color 0.2s;
        }

        .delete-btn:hover {
          color: #ef4444;
        }

        .error-message {
          color: #ef4444;
          font-size: 0.875rem;
          margin-top: 8px;
        }

        .empty-state {
          text-align: center;
          padding: 48px;
          color: #666;
        }

        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .app {
            padding: 16px;
          }

          .app-header h1 {
            font-size: 2rem;
          }

          .total-value {
            font-size: 2.5rem;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .holdings-grid {
            grid-template-columns: 1fr;
          }

          .section-header {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }

          .btn-primary {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}