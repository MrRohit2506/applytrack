import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ActivityChart from "../components/ActivityChart.jsx";
import StatusDistributionChart from "../components/StatusDistributionChart.jsx";

const byStatus = { Applied: 3, Interview: 2, Offer: 1, Rejected: 1, Withdrawn: 1 };

describe("StatusDistributionChart", () => {
  it("shows every status with its real count and share, and a text summary", () => {
    render(<StatusDistributionChart byStatus={byStatus} total={8} />);
    const fig = screen.getByRole("figure", { name: "Applications by status" });
    for (const s of Object.keys(byStatus)) expect(within(fig).getByText(s)).toBeInTheDocument();
    expect(within(fig).getByText("(38%)")).toBeInTheDocument(); // 3 of 8 = 37.5% rounded
    expect(fig).toHaveTextContent("8 applications: 3 Applied, 2 Interview, 1 Offer, 1 Rejected, 1 Withdrawn.");
  });

  it("shows zeros (not NaN) when there is no data", () => {
    render(<StatusDistributionChart byStatus={{ Applied: 0, Interview: 0, Offer: 0, Rejected: 0, Withdrawn: 0 }} total={0} />);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\(0%\)/)).toHaveLength(5);
  });
});

describe("ActivityChart", () => {
  const timeline = [
    { period: "2026-01-01", count: 2 },
    { period: "2026-02-01", count: 0 },
    { period: "2026-03-01", count: 4 },
  ];

  it("draws one bar per period with accessible text alternatives", () => {
    const { container } = render(<ActivityChart timeline={timeline} groupBy="month" />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(screen.getByRole("img", { name: /6 applications per month/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getAllByRole("row", { hidden: true })).toHaveLength(4); // header + 3 periods
    expect(table).toHaveTextContent("4");
  });

  it("shows a bar's value on hover", () => {
    const { container } = render(<ActivityChart timeline={timeline} groupBy="month" />);
    fireEvent.mouseEnter(container.querySelectorAll("rect")[2]);
    expect(screen.getByText(/: 4 applications$/, { selector: "p" })).toBeInTheDocument();
  });
});
