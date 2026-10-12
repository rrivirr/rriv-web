import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfigForm } from "@/components/connect/ConfigForm";
import type { SerialRecord } from "@/serial";

function renderForm(values: SerialRecord, onApply = vi.fn()) {
  const view = render(
    <ConfigForm name="Sensor" values={values} onApply={onApply} />,
  );
  const rerender = (next: SerialRecord) =>
    view.rerender(
      <ConfigForm name="Sensor" values={next} onApply={onApply} />,
    );
  return { onApply, rerender };
}

describe("ConfigForm", () => {
  it("keeps the user's edits when a re-read lands mid-edit", async () => {
    const user = userEvent.setup();
    const { onApply, rerender } = renderForm({ wait_time: 5, gain: 1 });

    const wait = screen.getByLabelText(/Wait time/);
    await user.clear(wait);
    // A second read arrives between clearing and typing; gain changed on the board.
    rerender({ wait_time: 5, gain: 2 });
    await user.type(wait, "9");

    expect(wait).toHaveValue(9);
    expect(screen.getByLabelText(/Gain/)).toHaveValue(2);
    await user.click(screen.getByRole("button", { name: "Apply sensor config" }));
    expect(onApply).toHaveBeenCalledWith({ wait_time: 9 });
  });

  it("resets to the board's reply after Apply", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm({ wait_time: 5 });

    const wait = screen.getByLabelText(/Wait time/);
    await user.clear(wait);
    await user.type(wait, "500");
    await user.click(screen.getByRole("button", { name: "Apply sensor config" }));
    // The board clamped the value.
    rerender({ wait_time: 300 });

    expect(screen.getByLabelText(/Wait time/)).toHaveValue(300);
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it("keeps edited JSON on re-read, replaces untouched JSON", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm({ wait_time: 5 });
    await user.click(screen.getByRole("button", { name: "JSON" }));
    const json = screen.getByLabelText("Sensor config JSON");

    rerender({ wait_time: 6 });
    expect(json).toHaveValue(JSON.stringify({ wait_time: 6 }, null, 2));

    await user.clear(json);
    await user.type(json, "{{}");
    rerender({ wait_time: 7 });
    expect(json).toHaveValue("{}");
  });
});
