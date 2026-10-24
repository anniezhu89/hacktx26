// Fictional sample labels for the demo chooser and tests. Drug names are real
// generics so reference material can be cited; every label, quantity and
// direction is invented, and no label carries patient or prescriber details.
export const sampleLabels = {
  lisinoprilClear: [
    "Medication: Lisinopril",
    "Strength: 10 mg",
    "Form: tablet",
    "Quantity: 30",
    "Directions: Take one tablet by mouth once daily.",
  ].join("\n"),
  metforminClear: [
    "Medication: Metformin",
    "Strength: 500 mg",
    "Form: tablet",
    "Quantity: 60",
    "Directions: Take one tablet by mouth twice daily with meals.",
  ].join("\n"),
  atorvastatinUnreadable: [
    "Medication: Atorvastatin",
    "Strength: [unreadable]",
    "Form: tablet",
    "Quantity: 30",
    "Directions: Take one tablet by mouth once daily.",
  ].join("\n"),
  lisinoprilUnitMismatch: [
    "Medication: Lisinopril",
    "Strength: 10 mcg",
    "Form: tablet",
    "Quantity: 30",
    "Directions: Take one tablet by mouth once daily.",
  ].join("\n"),
  metforminExtendedRelease: [
    "Metformin ER 500 mg tablet",
    "Take one tablet by mouth once daily with the evening meal.",
    "Qty: 30",
  ].join("\n"),
  fictionalTaper: [
    "Medication: Fictional Demo Tablet",
    "Strength: 5 mg",
    "Form: tablet",
    "Quantity: 10",
    "Directions: Take two tablets daily for 3 days, then one tablet daily.",
  ].join("\n"),
} as const;
