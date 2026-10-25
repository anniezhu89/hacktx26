export type DesignIconName =
  "label" | "photo" | "text" | "book" | "search" | "share";
const paths: Record<DesignIconName, string> = {
  label: "M4 3h16v18H4zM4 8h16M4 13h16M4 18h16",
  photo:
    "M3 7h4l2-3h6l2 3h4v14H3zM15.5 13.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
  text: "M4 6h16M4 12h16M4 18h12",
  book: "M3 4h8l1 1 1-1h8v16h-8l-1 1-1-1H3zM12 5v16",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  share:
    "M9 8l6-3M9 16l6 3M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
};
export function DesignIcon({ name }: { name: DesignIconName }) {
  return (
    <svg
      className="design-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
