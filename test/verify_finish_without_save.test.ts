
import { $ } from "bun";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";

const alcomPath = join(import.meta.dir, "../src/index.ts");

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

        // Make changes without using 'save'
        await $`echo "change 1" > file1.txt`;
        await $`echo "change 2" > file2.txt`;

        // Finish without any prior saves (should work as a normal commit)
        await $`bun ${alcomPath} finish "feat: add new files"`;

        // Check that the commit was created
        const log = await $`git log -1 --pretty=%B`.text();
        console.log("Last commit message:");
        console.log(log);

        if (log.includes("feat: add new files")) {
            console.log("✓ Commit message is correct");
        } else {
            console.log("✗ Commit message is incorrect");
            process.exit(1);
        }

        // Check that files were committed
        const file1 = await $`git show HEAD:file1.txt`.text();
        const file2 = await $`git show HEAD:file2.txt`.text();

        if (file1.includes("change 1") && file2.includes("change 2")) {
            console.log("✓ Files were committed correctly");
        } else {
            console.log("✗ Files were not committed correctly");
            process.exit(1);
        }

        // Check that there are no uncommitted changes
        const status = await $`git status --porcelain`.text();
        if (status.trim() === "") {
            console.log("✓ No uncommitted changes");
        } else {
            console.log("✗ Uncommitted changes found");
            process.exit(1);
        }

        console.log("\nVerification PASSED");

    } catch (error) {
        console.error("Test failed", error);
        process.exit(1);
    } finally {
        // Cleanup
        await rm(tmpDir, { recursive: true, force: true });
    }
}

run();
