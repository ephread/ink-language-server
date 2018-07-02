// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { InkErrorType } from "../types";

describe("InkErrorType.parse", () => {
  it("returns the correct InkErrorType when the input is valid", () => {
    expect(InkErrorType.parse("ERROR")).toEqual(InkErrorType.Error);
    expect(InkErrorType.parse("WARNING")).toEqual(InkErrorType.Warning);
    expect(InkErrorType.parse("RUNTIME ERROR")).toEqual(InkErrorType.RuntimeError);
    expect(InkErrorType.parse("RUNTIME WARNING")).toEqual(InkErrorType.RuntimeWarning);
    expect(InkErrorType.parse("TODO")).toEqual(InkErrorType.Todo);
  });

  it("returns undefined when the input is invalid", () => {
    expect(InkErrorType.parse("UNKNOWN")).toEqual(undefined);
  });
});
