
import { $ } from "bun";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm, readFile } from "fs/promises";
import { existsSync } from "fs";

// Path to compiled source handling
const alcomPath = join(import.meta.dir, "../src/index.ts");

async function run() {
    const tmpDir = await mkdtemp(join(tmpdir(), "alcom-adv-recovery-"));
    console.log(`Running advanced recovery test in ${tmpDir}`);

    try {
        // --- Setup ---
        await $`git init`.cwd(tmpDir);
        await $`git config user.name "Test User"`.cwd(tmpDir);
        await $`git config user.email "test@example.com"`.cwd(tmpDir);
        await $`touch initial.txt`.cwd(tmpDir);
        await $`git add .`.cwd(tmpDir);
        await $`git commit -m "Initial commit"`.cwd(tmpDir);
        const initialHash = (await $`git rev-parse HEAD`.cwd(tmpDir).text()).trim();

        // --- Scenario 1: Partial State Recovery (Level 1) ---
        console.log("\n--- Scenario 1: Partial State Recovery (Level 1) ---");

        await $`echo "change 1" > file1.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "snap 1"`.cwd(tmpDir); // First snapshot
        await $`echo "change 2" > file2.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "snap 2"`.cwd(tmpDir); // Second snapshot

        // Read state
        const stateFile = join(tmpDir, ".git", "always-commit.json");
        let state = JSON.parse(await readFile(stateFile, "utf-8"));
        if (state.commits.length !== 2) throw new Error("State should have 2 commits");
        const snap2Hash = state.commits[1].hash;

        console.log("Simulating external reset (removing last commit from git)...");
        await $`git reset --hard HEAD~1`.cwd(tmpDir); // Removes snap 2

        // Run 'status' to trigger check
        await $`bun ${alcomPath} status`.cwd(tmpDir);

        // Check state again
        state = JSON.parse(await readFile(stateFile, "utf-8"));
        if (state.commits.length !== 1) throw new Error(`State should be repaired to 1 commit, found ${state.commits.length}`);
        console.log("Passed: State truncated correctly.");

        // --- Scenario 2: Full State Loss / Auto Repair (Level 2) ---
        console.log("\n--- Scenario 2: Full State Loss / Auto Repair (Level 2) ---");

        // Create 'snap 3' (technically snap 2 again since we reset)
        await $`echo "change 2 again" > file2.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "snap 3"`.cwd(tmpDir);

        console.log("Simulating full state loss...");
        await rm(stateFile);

        // Run 'status'
        await $`bun ${alcomPath} status`.cwd(tmpDir);

        if (!existsSync(stateFile)) throw new Error("State file should be recreated");
        state = JSON.parse(await readFile(stateFile, "utf-8"));

        // Expecting 2 snapshots: snap 1, and snap 3.
        // Note: snap 1 was preserved in git history even though we reset snap 2.
        // Wait, we reset snap 2. So history is: Initial -> Snap 1 -> Snap 3.
        // So we expect 2 commits in state.
        if (state.commits.length !== 2) throw new Error(`State should be repaired to 2 commits, found ${state.commits.length}`);
        if (!state.commits[0].message.includes("snap 1")) throw new Error("First commit should be snap 1");
        if (!state.commits[1].message.includes("snap 3")) throw new Error("Second commit should be snap 3");
        console.log("Passed: State fully repaired from git history.");


        // --- Scenario 3: Manual Base Override (Level 3) ---
        console.log("\n--- Scenario 3: Manual Base Override (Level 3) ---");
        // We will finish using 'initialHash' as base, ignoring whatever session logic finds.
        // History: Initial -> Snap 1 -> Snap 3
        // If we base on Initial, we squash Snap 1 and Snap 3.

        // Let's corrupt state just to prove we don't need it or it bypasses it
        await rm(stateFile);

        console.log("Finishing with explicit --base...");
        await $`bun ${alcomPath} finish "Complete feature" --base ${initialHash}`.cwd(tmpDir);

        // Verify we have a single commit on top of Initial
        const newHead = (await $`git rev-parse HEAD`.cwd(tmpDir).text()).trim();
        const parent = (await $`git rev-parse HEAD^`.cwd(tmpDir).text()).trim();

        if (parent !== initialHash) {
            throw new Error(`Parent of new HEAD should be initial commit ${initialHash}, but was ${parent}`);
        }

        const msg = (await $`git log -1 --pretty=%B`.cwd(tmpDir).text());
        if (!msg.includes("Complete feature")) throw new Error("Commit message incorrect");

        console.log("Passed: Manual base override successful.");

        console.log("\nALL VERIFICATION TESTS PASSED");

    } catch (error) {
        console.error("Test failed", error);
        process.exit(1);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

run();
