import { BaseSequencer } from "vitest/node";
import type { TestSpecification } from "vitest/node";

// The integration tests share one database, so run the files in a fixed (alphabetical) order, not by previous duration.
export default class AlphabeticalSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) { return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId)); }
}
