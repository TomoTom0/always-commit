
import { $ } from "bun";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";

const alcomPath = join(import.meta.dir, "../src/index.ts");

async function run() {
    const tmpDir = await mkdtemp(join(tmpdir(), "alcom-test-"));
    console.log(`Running test in ${tmpDir}`);

    try {
        // Initialize git
        await $`git init`.cwd(tmpDir);
        await $`git config user.name "Test User"`.cwd(tmpDir);
        await $`git config user.email "test@example.com"`.cwd(tmpDir);
        await $`touch initial.txt`.cwd(tmpDir);
        await $`git add .`.cwd(tmpDir);
        await $`git commit -m "Initial commit"`.cwd(tmpDir);

        // First save
        await $`echo "change 1" > file1.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "First change"`.cwd(tmpDir);

        // Second save
        await $`echo "change 2" > file2.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "Second change"`.cwd(tmpDir);

        // Finish with append
        await $`bun ${alcomPath} finish "Feature complete" --append`.cwd(tmpDir);

        // Check log
        const log = await $`git log -1 --pretty=%B`.cwd(tmpDir).text();
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
        await rm(tmpDir, { recursive: true, force: true });
    }
}

run();
