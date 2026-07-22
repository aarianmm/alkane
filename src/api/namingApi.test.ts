import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeedGraph } from "../graph/types";
import { addAtomFromStub } from "../graph/mutations";
import { NamingApiError, nameMolecule } from "./namingApi";

describe("nameMolecule", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the graph in the API's atom/bond format and returns the names", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ names: ["ethane"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    let graph = createSeedGraph();
    graph = addAtomFromStub(graph, graph.rootId, "C", 1);

    const result = await nameMolecule(graph);

    expect(result).toEqual({ names: ["ethane"] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/name");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      atoms: [
        { element: "C", bonds: [{ to: 1, order: 1 }] },
        { element: "C", bonds: [{ to: 0, order: 1 }] },
      ],
    });
  });

  it("throws a NamingApiError with the API's own message on a chemistry error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "ChemistryError", message: "The molecule seems to have no ends" }), {
        status: 422,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(nameMolecule(createSeedGraph())).rejects.toThrow("The molecule seems to have no ends");
    await expect(nameMolecule(createSeedGraph())).rejects.toBeInstanceOf(NamingApiError);
  });

  it("falls back to a generic message when the error response has no usable body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(nameMolecule(createSeedGraph())).rejects.toThrow(/500/);
  });
});
