import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let QuickActionButton: typeof import("./QuickActionButton").QuickActionButton;
let Zap: typeof import("lucide-react").Zap;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeAll(async () => {
  ({ act } = await import("react"));
  ({ createRoot } = await import("react-dom/client"));
  ({ QuickActionButton } = await import("./QuickActionButton"));
  ({ Zap } = await import("lucide-react"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
afterAll(() => GlobalRegistrator.unregister());

describe("QuickActionButton", () => {
  test("sends its exact daemon prompt on click", async () => {
    const send = mock(() => {});
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<QuickActionButton color="violet" title="Plan" text="Planla" summary="Bugünü planla" icon={Zap} onSend={send} />));
    await act(async () => host.querySelector("button")!.click());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("Planla");
  });
});
