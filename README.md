# ClearTrack

This project contains a FastAPI backend and a React frontend.

## Development

Run the backend with:

```bash
uvicorn backend.api.main:app --reload
```

Run the frontend with:

```bash
cd frontend
npm start
```

## Deployment

[Vercel](https://vercel.com/) is used for deployment. The configuration in
`vercel.json` builds the frontend from the `frontend/` directory and exposes the
FastAPI app as a serverless function under `/api`.

Install the Vercel CLI and run `vercel` from the project root to deploy.
Environment variables for the backend can be configured in the Vercel dashboard.
