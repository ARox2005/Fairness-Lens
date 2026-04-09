import "./globals.css";

export const metadata = {
  title: "FairnessLens — AI Bias Detection & Mitigation",
  description:
    "Inspect, Measure, Flag, and Fix bias in ML models. Built for Google Solution Challenge 2026.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-[#0F1117] text-gray-900 dark:text-gray-100 transition-colors duration-300">
        {children}
      </body>
    </html>
  );
}
