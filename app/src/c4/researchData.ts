// C4 research results shown in the app (Plan -> Research results).
// GENERATED from components/c4_recommend/experiments/weekplan_frontier_results.json and
// weekplan_results_test.json (held-out C3 test bowlers, true hazard from experiments/oracle.py).
// Re-run the experiments, then regenerate this file - do not edit numbers by hand.
export type Pt = { x: number; y: number };

export const RESEARCH = {
  "test": {
    "bowlers": 29,
    "sessions": 366
  },
  "overValue": 0.0015,
  "points": {
    "usual": {
      "x": 100.0,
      "y": 6.352
    },
    "ecb": {
      "x": 89.8,
      "y": 5.887
    },
    "rules": {
      "x": 86.8,
      "y": 5.771
    },
    "rest": {
      "x": 62.2,
      "y": 5.37
    },
    "planner": {
      "x": 81.9,
      "y": 5.556
    },
    "best": {
      "x": 58.8,
      "y": 5.318
    }
  },
  "curves": {
    "model": [
      {
        "x": 0.3,
        "y": 5.707
      },
      {
        "x": 0.7,
        "y": 5.689
      },
      {
        "x": 3.6,
        "y": 5.639
      },
      {
        "x": 14.8,
        "y": 5.555
      },
      {
        "x": 27.7,
        "y": 5.442
      },
      {
        "x": 39.5,
        "y": 5.361
      },
      {
        "x": 51.5,
        "y": 5.338
      },
      {
        "x": 58.8,
        "y": 5.318
      },
      {
        "x": 68.6,
        "y": 5.326
      },
      {
        "x": 74.1,
        "y": 5.354
      },
      {
        "x": 78.1,
        "y": 5.421
      },
      {
        "x": 81.9,
        "y": 5.556
      },
      {
        "x": 85.1,
        "y": 5.682
      },
      {
        "x": 86.8,
        "y": 5.766
      },
      {
        "x": 87.8,
        "y": 5.78
      },
      {
        "x": 89.5,
        "y": 5.856
      }
    ],
    "uniform": [
      {
        "x": 62.2,
        "y": 5.37
      },
      {
        "x": 66.8,
        "y": 5.354
      },
      {
        "x": 70.1,
        "y": 5.386
      },
      {
        "x": 73.1,
        "y": 5.427
      },
      {
        "x": 75.9,
        "y": 5.478
      },
      {
        "x": 78.6,
        "y": 5.534
      },
      {
        "x": 81.5,
        "y": 5.604
      },
      {
        "x": 84.0,
        "y": 5.686
      },
      {
        "x": 86.6,
        "y": 5.765
      },
      {
        "x": 89.5,
        "y": 5.856
      }
    ]
  },
  "vsRules": {
    "injuries": -0.22,
    "injuriesCi": [
      -0.57,
      -0.01
    ],
    "overs": -4.9,
    "oversCi": [
      -9.4,
      -1.5
    ]
  },
  "extraPreventedPct": 37,
  "prevented": {
    "rules": 0.58,
    "planner": 0.8
  },
  "validity": {
    "pairs": 1684,
    "agreementPct": 73,
    "spearman": 0.54
  },
  "latencyMs": 84,
  "oracleError": 6.824904038706024e-05
} as const;
