import fs from "fs/promises";
import FMCFileSystemStore from "./fs.js";

class FMCNodeFSStore extends FMCFileSystemStore {
  override async readFile(path: string) {
    return fs.readFile(path, "utf8");
  }

  override async writeFile(path: string, content: string) {
    return fs.writeFile(path, content);
  }
}

export default FMCNodeFSStore;
