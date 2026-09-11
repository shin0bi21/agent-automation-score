import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_NAME_LENGTH = 64;

type Frontmatter = Record<string, string>;

interface ParsedSkill {
  frontmatter: Frontmatter;
  body: string;
}

function parseFrontmatter(contents: string, source: string): ParsedSkill {
  const normalized = contents.replaceAll("\r\n", "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    throw new Error(`${source}: expected YAML frontmatter wrapped in --- markers`);
  }

  const frontmatter: Frontmatter = {};
  for (const [index, line] of match[1].split("\n").entries()) {
    if (!line.trim()) {
      continue;
    }

    const field = line.match(/^([a-z][a-z0-9_-]*):\s*(.+)$/);
    if (!field) {
      throw new Error(`${source}:${index + 2}: expected a single-line key: value field`);
    }

    const [, key, rawValue] = field;
    if (key in frontmatter) {
      throw new Error(`${source}:${index + 2}: duplicate frontmatter field '${key}'`);
    }

    frontmatter[key] = rawValue.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2").trim();
  }

  return { frontmatter, body: match[2].trim() };
}

async function discoverSkillDirectories(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort();
}

async function validateSkill(skillDirectory: string): Promise<void> {
  const directory = path.resolve(skillDirectory);
  const skillFile = path.join(directory, "SKILL.md");

  if (!(await stat(skillFile).catch(() => undefined))?.isFile()) {
    throw new Error(`${skillFile}: file does not exist`);
  }

  const { frontmatter, body } = parseFrontmatter(await readFile(skillFile, "utf8"), skillFile);
  const keys = Object.keys(frontmatter).sort();
  const unsupported = keys.filter((key) => key !== "name" && key !== "description");

  if (unsupported.length > 0) {
    throw new Error(`${skillFile}: unsupported frontmatter field(s): ${unsupported.join(", ")}`);
  }

  const name = frontmatter.name;
  if (!name) {
    throw new Error(`${skillFile}: missing required 'name' field`);
  }
  if (!frontmatter.description) {
    throw new Error(`${skillFile}: missing required 'description' field`);
  }
  if (!SKILL_NAME.test(name)) {
    throw new Error(`${skillFile}: name must use lowercase hyphen-case`);
  }
  if (name.length > MAX_SKILL_NAME_LENGTH) {
    throw new Error(`${skillFile}: name exceeds ${MAX_SKILL_NAME_LENGTH} characters`);
  }
  if (name !== path.basename(directory)) {
    throw new Error(`${skillFile}: name '${name}' must match directory '${path.basename(directory)}'`);
  }
  if (!body) {
    throw new Error(`${skillFile}: skill instructions must not be empty`);
  }
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const skillDirectories = requested.length > 0
    ? requested
    : await discoverSkillDirectories(path.resolve(".agents/skills"));

  if (skillDirectories.length === 0) {
    throw new Error("No skill directories found");
  }

  const failures: string[] = [];
  for (const skillDirectory of skillDirectories) {
    try {
      await validateSkill(skillDirectory);
      console.log(`valid ${path.relative(process.cwd(), path.resolve(skillDirectory))}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`invalid ${failure}`);
    }
    process.exitCode = 1;
  }
}

await main();
