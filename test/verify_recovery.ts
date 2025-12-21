
import { $ } from "bun";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";
import { existsSync } from "fs";

// Use absolute path to the compiled js or just run ts with bun
const alcomPath = join(import.meta.dir, "../src/index.ts");

async function run() {
    const tmpDir = await mkdtemp(join(tmpdir(), "alcom-recovery-test-"));
    console.log(`Running recovery test in ${tmpDir}`);

    try {
        $.cwd(tmpDir);

        // Initialize git
        await $`git init`;
        await $`git config user.name "Test User"`;
        await $`git config user.email "test@example.com"`;
        await $`touch initial.txt`;
        await $`git add .`;
        await $`git commit -m "Initial commit"`;

        // 1. Create a session
        console.log("Creating session...");
        await $`echo "change 1" > file1.txt`;
        await $`bun ${alcomPath} save "snap 1"`;
        await $`echo "change 2" > file2.txt`;
        await $`bun ${alcomPath} save "snap 2"`;

        // Check if state file exists
        const stateFile = join(tmpDir, ".git", "always-commit.json");
        if (!existsSync(stateFile)) {
            throw new Error("State file should exist");
        }
        console.log("State file exists.");

        // 2. Simulate state loss
        console.log("Deleting state file to simulate failure...");
        await $`rm ${stateFile}`;

        if (existsSync(stateFile)) {
            throw new Error("Failed to delete state file");
        }

        // 3. Attempt recovery with 'status'
        console.log("Running 'status' to trigger recovery...");
        // This should not fail. If it fails, automatic recovery didn't work.
        const statusOutput = await $`bun ${alcomPath} status`.text();
        console.log("Status output:", statusOutput);

        if (!statusOutput.trim()) {
            console.warn("Status output is empty, but command succeeded.");
        }

        // Check if state file was restored
        if (!existsSync(stateFile)) {
            throw new Error("State file was NOT restored after running command");
        }
        console.log("Recovery successful: State file restored.");

        // 4. Verify 'finish' works on recovered session
        console.log("Running 'finish'...");
        await $`bun ${alcomPath} finish "Recovered session"`;

        const log = await $`git log -1 --pretty=%B`.text();
        if (log.includes("Recovered session")) {
            console.log("Finish successful.");
        } else {
            throw new Error("Finish failed or commit message wrong");
        }

        console.log("VERIFICATION PASSED");

    } catch (error) {
        console.error("Test failed", error);
        process.exit(1);
    } finally {
        // Cleanup
        await rm(tmpDir, { recursive: true, force: true });
    }
}

run();
