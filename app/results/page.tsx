"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  calculateAffordability,
  type UserInputs,
  type StateResult,
} from "../../lib/affordability";

export default function ResultsPage() {
  const router = useRouter();
  const [inputs, setInputs] = useState<UserInputs | null>(null);
  const [results, setResults] = useState<StateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());
  const [filterClassification, setFilterClassification] = useState<string>("");
  const [filterMaxYears, setFilterMaxYears] = useState<string>("");
  const [filterMinDisposable, setFilterMinDisposable] = useState<string>("");

  // Classification hierarchy (best to worst)
  const CLASSIFICATION_HIERARCHY = [
    "Very viable and stable",
    "Viable",
    "Viable with a higher % allocated",
    "Viable with extreme care",
    "Viable only when renting",
    "No viable path",
  ] as const;

  // Get all classifications at or better than the selected one
  const getClassificationsAtOrBetter = (selected: string): string[] => {
    if (!selected) return [];
    const index = CLASSIFICATION_HIERARCHY.indexOf(selected as typeof CLASSIFICATION_HIERARCHY[number]);
    if (index === -1) return [selected]; // If not in hierarchy, return as-is (defensive)
    return CLASSIFICATION_HIERARCHY.slice(0, index + 1) as string[];
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("affordability-inputs");
      if (!stored) {
        setLoading(false);
        return;
      }

      const parsed: UserInputs = JSON.parse(stored);
      setInputs(parsed);

      // Calculate results
      const calculated = calculateAffordability(parsed);
      setResults(calculated);
    } catch (error) {
      console.error("Error loading or calculating results:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate rankings and suggestions
  const { topBest, topSafest, worstFit, topMostRecommended, suggestionsByState } = useMemo(() => {
    if (results.length === 0) {
      return { topBest: [], topSafest: [], worstFit: [], topMostRecommended: [], suggestionsByState: new Map() };
    }

    // Top 3 most viable (highest viability rating)
    const topBest = [...results]
      .sort((a, b) => b.viabilityRating - a.viabilityRating)
      .slice(0, 3);

    // Top 3 safest (highest savings %)
    const topSafest = [...results]
      .sort((a, b) => b.savingsPercent - a.savingsPercent)
      .slice(0, 3);

    // Top 3 most recommended (balance of viability, savings, and fast timelines)
    const topMostRecommended = [...results]
      .map((r) => {
        // Score: viability rating (40%), savings % (30%), inverse of years to home (30%)
        const yearsScore = r.yearsToHome !== null && r.yearsToHome > 0 
          ? Math.max(0, (20 - r.yearsToHome) / 20) * 10
          : 0;
        const score = (r.viabilityRating * 0.4) + (r.savingsPercent * 10 * 0.3) + (yearsScore * 0.3);
        return { ...r, recommendationScore: score };
      })
      .sort((a, b) => (b as any).recommendationScore - (a as any).recommendationScore)
      .slice(0, 3)
      .map(r => {
        const { recommendationScore, ...rest } = r as any;
        return rest;
      });

    // Worst fit (no viable path or barely viable)
    const worstFit = results
      .filter(
        (r) =>
          r.classification === "No viable path" ||
          r.classification === "Viable only when renting"
      )
      .slice(0, 3);

    // Generate suggestions for each state
    const suggestionsByState = new Map<string, string[]>();
    results.forEach((result) => {
      const suggestions: string[] = [];
      const state = result.stateAbbr || result.state;

      if (result.disposableIncome <= 0) {
        suggestions.push(
          `Consider renting for several years until income increases or costs decrease.`
        );
        suggestions.push(`Lower your home size preference to reduce down payment requirements.`);
      }

      if (result.yearsToHome === null && result.disposableIncome > 0) {
        suggestions.push(
          `Increase your allocation percentage above ${(result.minDebtPercent * 100).toFixed(1)}% to make home ownership viable.`
        );
        suggestions.push(
          `Consider a smaller home size to reduce the down payment target.`
        );
      }

      if (result.yearsToDebtFree === null && result.disposableIncome > 0) {
        suggestions.push(
          `Increase your annual debt payment percentage to at least ${(result.minDebtPercent * 100).toFixed(1)}% to pay off student loans.`
        );
      }

      if (
        result.classification === "Viable only when renting" ||
        result.classification === "Viable with extreme care"
      ) {
        suggestions.push(
          `Rent for ${result.yearsToHome ? Math.ceil(result.yearsToHome) : 5}+ years before purchasing to build savings.`
        );
        if (inputs && inputs.advanced.futureKids && inputs.kids === 0) {
          suggestions.push(
            `Consider delaying children by several years to improve financial margins.`
          );
        }
      }

      if (suggestions.length > 0) {
        suggestionsByState.set(state, suggestions);
      }
    });

    return { topBest, topSafest, worstFit, topMostRecommended, suggestionsByState };
  }, [results, inputs]);

  // Calculate annual mortgage payment (30-year fixed)
  const calculateMortgagePayment = (result: StateResult): number => {
    const { homeValue, mortgageRate, downPaymentPercent } = result;
    if (homeValue <= 0 || mortgageRate <= 0) return 0;
    
    const downPayment = homeValue * downPaymentPercent;
    const principal = homeValue - downPayment;
    if (principal <= 0) return 0;
    
    const monthlyRate = mortgageRate / 12;
    const numPayments = 30 * 12; // 30 years
    const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
      (Math.pow(1 + monthlyRate, numPayments) - 1);
    
    return monthlyPayment * 12; // Annual payment
  };

  // Filter and sort results
  const filteredAndSortedResults = useMemo(() => {
    let filtered = [...results];

    // Apply filters
    if (filterClassification) {
      const allowedClassifications = getClassificationsAtOrBetter(filterClassification);
      filtered = filtered.filter((r) => allowedClassifications.includes(r.classification));
    }
    if (filterMaxYears) {
      const maxYears = Number(filterMaxYears);
      if (!isNaN(maxYears)) {
        filtered = filtered.filter((r) => r.yearsToHome === null || r.yearsToHome <= maxYears);
      }
    }
    if (filterMinDisposable) {
      const minDisposable = Number(filterMinDisposable);
      if (!isNaN(minDisposable)) {
        filtered = filtered.filter((r) => r.disposableIncome >= minDisposable);
      }
    }

    // Sort by viability rating (most viable first)
    return filtered.sort((a, b) => b.viabilityRating - a.viabilityRating);
  }, [results, filterClassification, filterMaxYears, filterMinDisposable]);

  const toggleExpand = (stateAbbr: string) => {
    const newExpanded = new Set(expandedStates);
    if (newExpanded.has(stateAbbr)) {
      newExpanded.delete(stateAbbr);
    } else {
      newExpanded.add(stateAbbr);
    }
    setExpandedStates(newExpanded);
  };

  const toggleSuggestions = (stateAbbr: string) => {
    const newExpanded = new Set(expandedSuggestions);
    if (newExpanded.has(stateAbbr)) {
      newExpanded.delete(stateAbbr);
    } else {
      newExpanded.add(stateAbbr);
    }
    setExpandedSuggestions(newExpanded);
  };

  const handleRefine = () => {
    // Store current results for refinement page
    window.localStorage.setItem("affordability-results", JSON.stringify(results));
    router.push("/refine");
  };

  // Generate actionable recommendations with apply buttons
  type Recommendation = {
    text: string;
    action?: () => void;
    actionLabel?: string;
    state?: string;
  };

  const generateActionableRecommendations = useMemo((): Recommendation[] => {
    if (!inputs || results.length === 0) return [];

    const recommendations: Recommendation[] = [];

    results.forEach((result) => {
      const stateAbbr = result.stateAbbr || result.state;

      // Increase allocation percentage - find optimal value
      if (result.yearsToHome === null && result.disposableIncome > 0) {
        // Calculate the minimum required allocation
        const minRequired = (result.requiredAllocationPercent || (result.minDebtPercent + result.minCreditPercent)) * 100;
        const currentAlloc = (inputs.allocationPercent * 100);
        
        // Optimal allocation: minimum required + 5% buffer for safety
        const optimalAlloc = Math.min(100, Math.ceil((minRequired + 5) / 5) * 5); // Round up to nearest 5%
        const increaseBy = Math.max(0, optimalAlloc - currentAlloc);
        const newAllocation = optimalAlloc / 100;

        recommendations.push({
          text: `For ${result.state}: Increase allocation percentage from ${currentAlloc.toFixed(1)}% to ${(newAllocation * 100).toFixed(1)}% to make home ownership viable.`,
          state: result.state,
          action: () => {
            if (!inputs) return;
            const updated = {
              ...inputs,
              allocationPercent: newAllocation,
            };
            setInputs(updated);
            window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
            const calculated = calculateAffordability(updated);
            setResults(calculated);
            window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
          },
          actionLabel: "Apply this change",
        });
      }

      // Lower home size
      if (result.yearsToHome === null || (result.yearsToHome && result.yearsToHome > 15)) {
        const homeSizeOrder = ["veryLarge", "large", "medium", "small"];
        const currentIndex = homeSizeOrder.indexOf(inputs.homeSize);
        if (currentIndex > 0) {
          const smallerSize = homeSizeOrder[currentIndex - 1] as UserInputs["homeSize"];

          recommendations.push({
            text: `For ${result.state}: Consider a ${smallerSize} home instead of ${inputs.homeSize} to reduce down payment requirements.`,
            state: result.state,
            action: () => {
              if (!inputs) return;
              const updated = {
                ...inputs,
                homeSize: smallerSize,
              };
              setInputs(updated);
              window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
              const calculated = calculateAffordability(updated);
              setResults(calculated);
              window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
            },
            actionLabel: "Apply this change",
          });
        }
      }

      // Increase debt payment allocation - find optimal value
      if (result.yearsToDebtFree === null && result.disposableIncome > 0 && inputs.studentLoanBalance > 0) {
        const minDebtPercent = (result.requiredAllocationPercent || result.minDebtPercent) * 100;
        const currentAlloc = (inputs.allocationPercent * 100);
        const currentCreditPercent = (result.minCreditPercent || 0) * 100;
        const currentDebtAlloc = currentAlloc - currentCreditPercent;

        if (currentDebtAlloc < minDebtPercent) {
          // Optimal allocation: debt minimum + credit minimum + 5% buffer
          const optimalAlloc = Math.min(100, Math.ceil((minDebtPercent + currentCreditPercent + 5) / 5) * 5);
          const increaseBy = Math.max(0, optimalAlloc - currentAlloc);
          const newAllocation = optimalAlloc / 100;

          recommendations.push({
            text: `For ${result.state}: Increase allocation percentage to ${(newAllocation * 100).toFixed(1)}% (currently ${currentAlloc.toFixed(1)}%) to achieve debt-free status in a reasonable timeframe.`,
            state: result.state,
            action: () => {
              if (!inputs) return;
              const updated = {
                ...inputs,
                allocationPercent: newAllocation,
              };
              setInputs(updated);
              window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
              const calculated = calculateAffordability(updated);
              setResults(calculated);
              window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
            },
            actionLabel: "Apply this change",
          });
        }
      }

      // Delay children suggestion
      if (
        inputs.advanced.futureKids &&
        inputs.kids === 0 &&
        inputs.advanced.firstChildAge &&
        result.yearsToHome !== null &&
        result.yearsToHome > 0 &&
        inputs.age
      ) {
        const currentAge = inputs.age;
        const childAge = inputs.advanced.firstChildAge;
        const delayBy = Math.ceil(result.yearsToHome - (childAge - currentAge)) + 2;

        if (delayBy > 0) {
          const newChildAge = currentAge + result.yearsToHome + 2;

          recommendations.push({
            text: `For ${result.state}: Delay having children until age ${Math.round(newChildAge)} (${delayBy} years later) to secure home ownership first.`,
            state: result.state,
            action: () => {
              if (!inputs) return;
              const updated = {
                ...inputs,
                advanced: {
                  ...inputs.advanced,
                  firstChildAge: Math.round(newChildAge),
                },
              };
              setInputs(updated);
              window.localStorage.setItem("affordability-inputs", JSON.stringify(updated));
              const calculated = calculateAffordability(updated);
              setResults(calculated);
              window.localStorage.setItem("affordability-results", JSON.stringify(calculated));
            },
            actionLabel: "Apply this change",
          });
        }
      }
    });

    return recommendations;
  }, [inputs, results]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <p className="text-slate-300">Loading results...</p>
      </div>
    );
  }

  if (!inputs) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
          <div className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-50">
              No results available
            </h1>
            <p className="text-slate-200">
              No stored inputs found. Please complete the form to see results.
            </p>
            <Link
              href="/"
              className="inline-block rounded-2xl bg-slate-800 px-6 py-3 text-base font-semibold text-slate-50 transition hover:bg-slate-700 border border-slate-700"
            >
              Go to Calculator
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3 rounded-3xl border border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Results Overview
          </p>
          <h1 className="text-4xl font-bold text-slate-50">
            Affordability Analysis
          </h1>
              <p className="max-w-3xl text-base text-slate-300 font-medium">
                Your results are shown below, organized by state. Review the viability
                classifications, key metrics, and recommendations to refine your plan.
              </p>
        </header>

        {/* Rankings Section */}
        {(topBest.length > 0 || topSafest.length > 0 || worstFit.length > 0 || topMostRecommended.length > 0) && (
          <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {topBest.length > 0 && (
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-slate-50 mb-3">
                  Top 3 Most Viable States
                </h3>
                <ul className="space-y-2">
                  {topBest.map((result, idx) => (
                    <li key={result.stateAbbr || result.state} className="text-sm">
                      <span className="font-semibold text-slate-200">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-slate-400 ml-2 font-semibold">
                        Viability Rating: {result.viabilityRating.toFixed(1)}/10
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {topSafest.length > 0 && (
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-slate-50 mb-3">
                  Top 3 Safest (Highest Savings Margin)
                </h3>
                <ul className="space-y-2">
                  {topSafest.map((result, idx) => (
                    <li key={result.stateAbbr || result.state} className="text-sm">
                      <span className="font-semibold text-slate-200">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-slate-400 ml-2">
                        ({(result.savingsPercent * 100).toFixed(1)}% savings)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {worstFit.length > 0 && (
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-slate-50 mb-3">
                  Top 3 Least Viable States
                </h3>
                <ul className="space-y-2">
                  {worstFit.map((result, idx) => (
                    <li key={result.stateAbbr || result.state} className="text-sm">
                      <span className="font-semibold text-slate-200">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-slate-400 ml-2 text-xs">
                        ({result.classification})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {topMostRecommended.length > 0 && (
              <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-slate-50 mb-3">
                  Top 3 Most Recommended States
                </h3>
                <ul className="space-y-2">
                  {topMostRecommended.map((result, idx) => (
                    <li key={result.stateAbbr || result.state} className="text-sm">
                      <span className="font-semibold text-slate-200">
                        {idx + 1}. {result.state}
                      </span>
                      <span className="text-slate-400 ml-2 font-semibold">
                        Rating: {result.viabilityRating.toFixed(1)}/10
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Filter Controls */}
        <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
          <h2 className="text-xl font-semibold text-slate-50">Filter Results</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-2 block">
                Classification
              </label>
              <select
                value={filterClassification}
                onChange={(e) => setFilterClassification(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
              >
                <option value="">All Classifications</option>
                <option value="Very viable and stable">Very viable and stable</option>
                <option value="Viable">Viable</option>
                <option value="Viable with a higher % allocated">Viable with a higher % allocated</option>
                <option value="Viable with extreme care">Viable with extreme care</option>
                <option value="Viable only when renting">Viable only when renting</option>
                <option value="No viable path">No viable path</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-2 block">
                Max Years to Home
              </label>
              <input
                type="number"
                value={filterMaxYears}
                onChange={(e) => setFilterMaxYears(e.target.value)}
                placeholder="e.g., 10"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-300 mb-2 block">
                Min Disposable Income ($)
              </label>
              <input
                type="number"
                value={filterMinDisposable}
                onChange={(e) => setFilterMinDisposable(e.target.value)}
                placeholder="e.g., 10000"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-500"
              />
            </div>
          </div>
          {(filterClassification || filterMaxYears || filterMinDisposable) && (
            <button
              type="button"
              onClick={() => {
                setFilterClassification("");
                setFilterMaxYears("");
                setFilterMinDisposable("");
              }}
              className="text-sm text-slate-300 hover:text-slate-100 font-semibold"
            >
              Clear Filters
            </button>
          )}
        </section>

        <div className="space-y-6">
          {filteredAndSortedResults.length === 0 ? (
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-sm">
              <p className="text-slate-200">No results available.</p>
            </div>
          ) : (
            filteredAndSortedResults.map((result) => {
              const mortgagePayment = calculateMortgagePayment(result);
              return (
              <div
                key={result.stateAbbr || result.state}
                className="space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-50">
                      {result.state}
                    </h2>
                    {result.stateAbbr && (
                      <p className="text-sm text-slate-400">{result.stateAbbr}</p>
                    )}
                  </div>
                  <div
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      result.classification === "Very viable and stable"
                        ? "bg-emerald-950 text-emerald-400"
                        : result.classification === "Viable"
                        ? "bg-green-950 text-green-400"
                        : result.classification === "Viable with a higher % allocated"
                        ? "bg-amber-950 text-amber-400"
                        : result.classification === "Viable with extreme care"
                        ? "bg-amber-950 text-amber-400"
                        : result.classification === "Viable only when renting"
                        ? "bg-amber-950 text-amber-400"
                        : "bg-rose-950 text-rose-400"
                    }`}
                  >
                    {result.classification}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-sm text-slate-400">Viability Rating</p>
                    <p className="text-lg font-semibold text-slate-50">
                      {result.viabilityRating.toFixed(1)}/10
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Portfolio score
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Minimum Savings %</p>
                    <p className="text-lg font-semibold text-slate-50">
                      {(result.savingsPercent * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      of disposable income
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Annual Disposable Income</p>
                    <p className="text-lg font-semibold text-slate-50">
                      ${result.disposableIncome.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Estimated Years to Buy a House</p>
                    <p className="text-lg font-semibold text-slate-50">
                      {result.yearsToHome === null ? "N/A" : `${result.yearsToHome.toFixed(1)} years`}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Typical Home Value</p>
                    <p className="text-lg font-semibold text-slate-50">
                      ${result.homeValue.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Combined Household Income</p>
                    <p className="text-lg font-semibold text-slate-50">
                      ${result.combinedIncome.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Years to Debt Free</p>
                    <p className="text-lg font-semibold text-slate-50">
                      {result.yearsToDebtFree === null ? "N/A" : `${result.yearsToDebtFree.toFixed(1)} years`}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Typical Mortgage Payment</p>
                    <p className="text-lg font-semibold text-slate-50">
                      ${mortgagePayment > 0 ? Math.round(mortgagePayment).toLocaleString() : "N/A"} / year
                    </p>
                    {mortgagePayment > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        (30-year fixed)
                      </p>
                    )}
                  </div>
                </div>

                {/* AI Overview & Affordability Recommendation */}
                <div className="border-t border-slate-700 pt-4">
                  <h3 className="text-lg font-semibold text-slate-50 mb-3">AI Overview & Recommendation</h3>
                  <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
                    {(() => {
                      const overview: string[] = [];
                      
                      // Overall assessment with specifics
                      if (result.classification === "Very viable and stable") {
                        overview.push(
                          `${result.state} presents an excellent opportunity for home ownership with strong financial stability. Your viability rating of ${result.viabilityRating.toFixed(1)}/10 indicates robust financial health. `
                        );
                        if (result.yearsToHome !== null) {
                          overview.push(
                            `You can achieve home ownership in approximately ${result.yearsToHome.toFixed(1)} years (age ${Math.round((inputs?.age || 0) + result.yearsToHome)}), with ${(result.savingsPercent * 100).toFixed(1)}% of your disposable income available for savings. `
                          );
                        }
                        overview.push(
                          `Consider areas in ${result.state} such as suburban communities or emerging neighborhoods where home values are appreciating steadily. `
                        );
                        overview.push(
                          `Recommendation: ${result.state} is highly recommended. With your current financial profile, you're well-positioned to purchase a home and build long-term wealth. Focus on maintaining your savings rate and consider starting to explore neighborhoods and mortgage pre-approval processes in the next year or two.`
                        );
                      } else if (result.classification === "Viable") {
                        overview.push(
                          `${result.state} is viable for home ownership, though it requires disciplined financial planning. Your viability rating of ${result.viabilityRating.toFixed(1)}/10 shows promise with some margin for improvement. `
                        );
                        if (result.yearsToHome !== null) {
                          overview.push(
                            `Home ownership is achievable in approximately ${result.yearsToHome.toFixed(1)} years (age ${Math.round((inputs?.age || 0) + result.yearsToHome)}). `
                          );
                        }
                        overview.push(
                          `To improve your path forward, consider increasing your allocation percentage to ${((result.requiredAllocationPercent || 0) * 100 + 5).toFixed(0)}% to create a safer buffer. `
                        );
                        overview.push(
                          `Areas to explore in ${result.state}: Look at more affordable suburban markets or smaller cities within the state where cost of living is lower but job markets remain strong. `
                        );
                        overview.push(
                          `Recommendation: ${result.state} is recommended with careful planning. Increase your allocation percentage by ${Math.max(5, ((result.requiredAllocationPercent || 0) * 100) - ((inputs?.allocationPercent || 0) * 100) + 5).toFixed(0)}% to accelerate your timeline and improve financial margins.`
                        );
                      } else if (result.classification === "Viable with a higher % allocated") {
                        overview.push(
                          `${result.state} becomes viable if you increase your allocation percentage. Currently, your allocation of ${((inputs?.allocationPercent || 0) * 100).toFixed(1)}% is insufficient for this state's cost structure. `
                        );
                        const optimalAlloc = Math.min(100, Math.ceil((result.requiredAllocationPercent || 0) * 100 / 5) * 5);
                        overview.push(
                          `To make this state viable, increase your allocation to at least ${optimalAlloc}% of disposable income. This would allow you to achieve home ownership in approximately ${result.yearsToHome ? result.yearsToHome.toFixed(1) : '15-20'} years. `
                        );
                        overview.push(
                          `Path forward: Focus on reducing discretionary spending or increasing income through career advancement. Consider areas in ${result.state} with lower home values to accelerate the timeline. `
                        );
                        overview.push(
                          `Recommendation: ${result.state} is conditionally recommended. Only pursue if you can commit to allocating ${optimalAlloc}%+ of disposable income. Otherwise, consider relocating to a more affordable state or renting longer-term.`
                        );
                      } else if (result.classification === "Viable with extreme care") {
                        overview.push(
                          `${result.state} is challenging but technically viable with extreme financial discipline. Your margins are tight, and any unexpected expenses could derail your plan. `
                        );
                        if (result.yearsToHome !== null) {
                          overview.push(
                            `The timeline is extended at ${result.yearsToHome.toFixed(1)} years to home ownership, requiring careful budgeting throughout. `
                          );
                        }
                        overview.push(
                          `What to improve: Increase allocation to ${Math.min(100, Math.ceil((result.requiredAllocationPercent || 0) * 100 / 5) * 5)}%, build an emergency fund equivalent to 6 months of expenses, and consider a smaller home size. `
                        );
                        overview.push(
                          `Where to live in ${result.state}: Focus on more affordable regions, rural areas, or smaller towns where housing costs are 20-30% lower than state averages. `
                        );
                        overview.push(
                          `Recommendation: ${result.state} is not recommended unless you have strong reasons to be there (family, job offer, etc.). Consider more affordable states or plan to rent for at least ${result.yearsToHome ? Math.ceil(result.yearsToHome) + 2 : 10}+ years before purchasing.`
                        );
                      } else if (result.classification === "Viable only when renting") {
                        overview.push(
                          `${result.state} is only viable if you rent for several years before purchasing. Your current disposable income cannot support both debt payments and home savings simultaneously. `
                        );
                        const rentYears = result.yearsToHome ? Math.ceil(result.yearsToHome) : 5;
                        overview.push(
                          `Recommended path: Rent for ${rentYears}+ years while building savings, then transition to home ownership. During this period, focus on career growth to increase income. `
                        );
                        overview.push(
                          `What to improve: Significantly increase income (aim for 20-30% growth) or reduce cost of living. Consider relocating to a more affordable state, or delay major financial commitments. `
                        );
                        overview.push(
                          `Where to live in ${result.state}: Rent in more affordable suburbs or smaller cities. Avoid expensive metropolitan areas where rent alone consumes most of your disposable income. `
                        );
                        overview.push(
                          `Recommendation: ${result.state} is not recommended for home ownership with current parameters. If you must live here, plan for a long rental period (${rentYears}+ years) while aggressively saving and growing income.`
                        );
                      } else {
                        overview.push(
                          `${result.state} does not present a viable path to home ownership with your current financial profile. Your disposable income of $${result.disposableIncome.toLocaleString()} is insufficient to cover cost of living, debt obligations, and home savings. `
                        );
                        overview.push(
                          `What to improve: Drastically increase income (50%+ growth needed) or significantly reduce cost of living. Consider relocating to a more affordable state where your income-to-expense ratio is better. `
                        );
                        overview.push(
                          `Alternative path: If you have a job offer only in ${result.state}, negotiate for higher compensation, consider roommates to reduce housing costs, or explore government assistance programs for first-time homebuyers. `
                        );
                        overview.push(
                          `Recommendation: ${result.state} is not recommended. Explore more affordable states or focus on income growth before considering home ownership here.`
                        );
                      }
                      
                      return overview.map((para, idx) => (
                        <p key={idx}>{para}</p>
                      ));
                    })()}
                  </div>
                </div>

                {/* Additional Information (Collapsible) */}
                <button
                  type="button"
                  onClick={() => toggleExpand(result.stateAbbr || result.state)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-200 hover:text-slate-50 transition"
                >
                  <span>Additional Information</span>
                  <svg
                    className={`h-5 w-5 text-slate-400 transition-transform ${
                      expandedStates.has(result.stateAbbr || result.state)
                        ? "rotate-180"
                        : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {expandedStates.has(result.stateAbbr || result.state) && (
                  <div className="border-t border-slate-700 pt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">
                          Cost of Living (household-adjusted)
                        </p>
                        <p className="text-sm text-slate-200 mt-1">
                          ${(result.combinedIncome - result.disposableIncome).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">
                          Mortgage Rate
                        </p>
                        <p className="text-sm text-slate-200 mt-1">
                          {(result.mortgageRate * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">
                          Required % of Disposable Income to Stay Solvent
                        </p>
                        <p className="text-sm text-slate-200 mt-1">
                          {((result.minDebtPercent + result.minCreditPercent) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">
                          Down Payment %
                        </p>
                        <p className="text-sm text-slate-200 mt-1">
                          {(result.downPaymentPercent * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggested Changes (Collapsible) */}
                <button
                  type="button"
                  onClick={() => toggleSuggestions(result.stateAbbr || result.state)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-200 hover:text-slate-50 transition mt-4"
                >
                  <span>Suggested Changes</span>
                  <svg
                    className={`h-5 w-5 text-slate-400 transition-transform ${
                      expandedSuggestions.has(result.stateAbbr || result.state)
                        ? "rotate-180"
                        : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {expandedSuggestions.has(result.stateAbbr || result.state) && (
                  <div className="border-t border-slate-700 pt-4 space-y-3">
                    {suggestionsByState.has(result.stateAbbr || result.state) ? (
                      <ul className="list-disc list-inside space-y-2 text-sm text-slate-200">
                        {suggestionsByState
                          .get(result.stateAbbr || result.state)
                          ?.map((suggestion: string, idx: number) => (
                            <li key={idx}>{suggestion}</li>
                          ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400">No specific suggestions for this state.</p>
                    )}
                  </div>
                )}

                {result.notes.length > 0 && (
                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-sm font-semibold text-slate-400 mb-2">Notes:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-slate-200">
                      {result.notes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
            })
          )}
        </div>

        {/* Actionable Recommendations Section */}
        {generateActionableRecommendations.length > 0 && (
          <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-lg">
            <h2 className="text-2xl font-semibold text-slate-50">Actionable Recommendations to Improve Viability</h2>
            <p className="text-sm text-slate-300">
              Click "Apply this change" on any recommendation below to automatically update your inputs and recalculate results.
            </p>
            <div className="space-y-4">
              {generateActionableRecommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 text-slate-400 font-bold">•</span>
                    <span className="text-sm text-slate-200 flex-1">{rec.text}</span>
                  </div>
                  {rec.action && (
                    <button
                      onClick={rec.action}
                      className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 shadow-md hover:shadow-lg"
                    >
                      {rec.actionLabel || "Apply this change"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3 text-base font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            ← Back to Calculator
          </Link>
          {results.length > 0 && (
          <button
            onClick={handleRefine}
            className="rounded-2xl bg-slate-800 border border-slate-700 px-6 py-3 text-base font-bold text-slate-50 transition hover:bg-slate-700 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            Refine Selection →
          </button>
          )}
        </div>
      </main>
    </div>
  );
}
