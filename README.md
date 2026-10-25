# hacktx26

LabelBridge is a hackathon demo for reading a **fictional** medication label, confirming the words, seeing a plain-language reading of those directions, finding savings resources, and sharing practical tasks.

This repository currently contains the first frontend pass: a React + Vite app in `apps/web`. Cases stay in the browser tab and use fixture data. Refreshing clears the case. It is not medical advice, and it does not check whether a dose is safe.

## Run the design prototype

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173).

`npm run check` typechecks the app and builds the production bundle.

## Demo path

1. Start with the clear lisinopril sample, confirm the critical fields, then open Understand.
2. Start again with metformin to see an unreadable strength block the dosing explanation.
3. Use the albuterol sample to see as-needed directions kept free of clock times.
4. Switch **Viewing as** to Reviewer for the reading desk, or Supporter after the patient shares the plan.
