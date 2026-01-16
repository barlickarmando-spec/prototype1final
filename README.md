# Affordability Planner

A comprehensive financial planning application that helps users determine the viability of home ownership across different U.S. states. Calculate your path to debt freedom and home ownership based on your income, expenses, and financial goals.

## Features

- **Multi-State Analysis**: Compare financial viability across all 50 U.S. states plus D.C.
- **Comprehensive Financial Planning**: 
  - Student loan debt management
  - Credit card debt payoff strategies
  - Home savings calculations
  - Annual mortgage payment calculations
- **Dynamic Financial Projections**:
  - Year-by-year breakdown
  - Account for cost of living changes with children
  - Mortgage payment calculations
  - Debt-free timelines
- **Interactive Results**:
  - Viability classifications and ratings
  - State-by-state comparisons
  - Actionable recommendations
  - PDF export capability
- **Detailed PDF Reports**:
  - Allocation percentages (disposable income & salary)
  - Home size options and timelines
  - Year-by-year financial breakdown
  - Wealth generation strategies

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone YOUR_REPO_URL
cd prototype1

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **PDF Generation**: jsPDF + jspdf-autotable
- **Data**: JSON-based state and financial data

## Project Structure

```
prototype1/
├── app/              # Next.js app router pages
│   ├── page.tsx      # Main input form
│   ├── results/      # Results page
│   ├── refine/       # Refinement page
│   └── final/        # Final output page
├── lib/              # Core logic
│   ├── affordability.ts    # Financial calculations
│   └── pdfGenerator.ts     # PDF generation
├── data/             # Data files
│   ├── state_data.json     # State-specific financial data
│   └── data_dictionary.json # Data labels
└── public/           # Static assets
```

## Key Features

### Financial Calculations

- Disposable income calculation (income - cost of living)
- Student loan minimum payments
- Credit card debt strategies (upfront vs. reserve)
- Home savings projections with compound interest
- Annual mortgage payment calculations (30-year fixed)
- Years to debt-free and home ownership

### Viability Classifications

- Very viable and stable (debt-free in ≤5 years)
- Viable (debt-free in 6-10 years)
- Viable with a higher % allocated
- Viable with extreme care (debt-free in 11-20 years)
- Viable only when renting (debt-free in 20+ years)
- No viable path

### Dynamic Adjustments

- Cost of living updates when children are added
- Mortgage payments after home purchase
- Recalculated allocations based on changing circumstances
- Partner income integration

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy to Vercel

1. Push code to GitHub
2. Import to [Vercel](https://vercel.com/new)
3. Deploy with one click

## Data Sources

Financial data includes:
- State-specific occupation salaries
- Cost of living by household type
- Typical home values (small, medium, large, very large)
- Mortgage rates and down payment percentages
- State flag images (via CDN)

## Important Notes

- All calculations are estimates based on provided data
- Results do not constitute financial advice
- Mortgage calculations use standard 30-year fixed rate formulas
- Cost of living adjustments are applied when children are added

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## License

[Add your license here]

## Support

For issues or questions, please open an issue on GitHub or contact [your contact information].

---

Built with Next.js and TypeScript
