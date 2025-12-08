
import { $ } from "bun";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";

const alcomPath = "/home/tomo/work/prac/ts/always-commit/src/index.ts";

async function run() {
    const tmpDir = await mkdtemp(join(tmpdir(), "alcom-test-"));
    console.log(`Running test in ${tmpDir}`);

    try {
        $.cwd(tmpDir);

        // Initialize git
        await $`git init`;
        await $`git config user.name "Test User"`;
        await $`git config user.email "test@example.com"`;
        await $`touch initial.txt`;
        await $`git add .`;
        await $`git commit -m "Initial commit"`;

        // First save
        await $`echo "change 1" > file1.txt`;
        await $`bun ${alcomPath} save "First change"`;

        // Second save
        await $`echo "change 2" > file2.txt`;
        await $`bun ${alcomPath} save "Second change"`;

        // Finish with append
        await $`bun ${alcomPath} finish "Feature complete" --append`;

        // Check log
        const log = await $`git log -1 --pretty=%B`.text();
        console.log("Last commit message:");
        console.log(log);

        if (log.includes("Feature complete") && log.includes("- First change") && log.includes("- Second change")) {
            console.log("Verification PASSED");
        } else {
            console.log("Verification FAILED");
            process.exit(1);
        }

    } catch (error) {
        console.error("Test failed", error);
        process.exit(1);
    } finally {
        // Cleanup
        // await rm(tmpDir, { recursive: true, force: true });
    }
}

run();
