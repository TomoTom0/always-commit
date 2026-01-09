
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

        // Create first commit as an alcom save (not a regular commit)
        await $`echo "file1" > file1.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "first save"`.cwd(tmpDir);

        // Create more alcom saves
        await $`echo "file2" > file2.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "second save"`.cwd(tmpDir);

        await $`echo "file3" > file3.txt`.cwd(tmpDir);
        await $`bun ${alcomPath} save "third save"`.cwd(tmpDir);

        // Verify all commits are alcom commits
        const logBefore = await $`git log --oneline`.cwd(tmpDir).text();
        console.log("Commits before finish:");
        console.log(logBefore);

        const alcomCount = (logBefore.match(/--alcom--/g) || []).length;
        console.log(`Alcom commits: ${alcomCount}`);

        if (alcomCount < 3) {
            console.log("Error: Expected at least 3 alcom commits");
            process.exit(1);
        }

        // Verify there are no non-alcom commits
        const commitCount = logBefore.trim().split("\n").length;
        if (alcomCount !== commitCount) {
            console.log(`Error: Expected all ${commitCount} commits to be alcom commits`);
            process.exit(1);
        }

        console.log("All commits are alcom commits. Testing finish...");

        // Finish - this should create a new root commit
        const finishResult = await $`bun ${alcomPath} finish "feat: complete feature"`.cwd(tmpDir).text();
        console.log("Finish result:", finishResult);

        // Verify the result
        const result = JSON.parse(finishResult);
        if (result.status !== "ok") {
            console.log("Error: finish command failed");
            process.exit(1);
        }
        console.log("finish command succeeded with hash:", result.hash);

        // Check that there is now only one commit
        const logAfter = await $`git log --oneline`.cwd(tmpDir).text();
        console.log("Commits after finish:");
        console.log(logAfter);

        const commitCountAfter = logAfter.trim().split("\n").length;
        if (commitCountAfter !== 1) {
            console.log(`Error: Expected 1 commit after finish, got ${commitCountAfter}`);
            process.exit(1);
        }
        console.log("Commit count after finish is correct (1)");

        // Check that the commit message is correct
        const lastCommitMsg = await $`git log -1 --pretty=%B`.cwd(tmpDir).text();
        if (!lastCommitMsg.includes("feat: complete feature")) {
            console.log("Error: Commit message is incorrect");
            process.exit(1);
        }
        console.log("Commit message is correct");

        // Check that all files exist
        const files = await $`git ls-tree -r HEAD --name-only`.cwd(tmpDir).text();
        console.log("Files in commit:", files);

        if (!files.includes("file1.txt") || !files.includes("file2.txt") || !files.includes("file3.txt")) {
            console.log("Error: Not all files were preserved");
            process.exit(1);
        }
        console.log("All files were preserved");

        // Check that the commit is a root commit (no parent)
        const parentCheck = await $`git rev-parse HEAD^`.cwd(tmpDir).nothrow();
        if (parentCheck.exitCode === 0) {
            console.log("Error: The commit should be a root commit (no parent)");
            process.exit(1);
        }
        console.log("The commit is a root commit (no parent)");

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
