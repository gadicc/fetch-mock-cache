import filenamifyUrl from "filenamify-url";
import fs from "fs/promises";

const CWD = process.cwd();
function cache_dir(filename: string) {
  return `${CWD}/tests/fixtures/http/${filename}`;
}
(async () => {
  await fs.mkdir(cache_dir(""), { recursive: true });
})();

async function exists(url: string) {
  const path = cache_dir(filenamifyUrl(url));

  let fileExists = false;
  try {
    await fs.access(path);
    fileExists = true;
  } catch (error) {}

  return fileExists;
}

async function fetchContent(url: string) {
  const path = cache_dir(filenamifyUrl(url));
  try {
    return await fs.readFile(path, "utf8");
  } catch (error) {
    return null;
  }
}

async function storeContent(url: string, content: Record<string, unknown>) {
  const path = cache_dir(filenamifyUrl(url));
  await fs.writeFile(path, JSON.stringify(content, null, 2));
}

export { fetchContent, storeContent };
