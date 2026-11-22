import { PrismaClient } from "../generated/client";
import fs from "fs";
import path from "path";

declare global {
  // eslint-disable-next-line no-var
  var centralPrisma: PrismaClient | undefined;
}

const SUPABASE_DEFAULT_CENTRAL_URL =
  "postgres://postgres.ojxkbwxbdtqackefxcbt:W2LM4X7WhRXu8Ir9@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";

function loadEnvFiles() {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../.env.local"),
    path.resolve(__dirname, "../../../.env"),
  ];

  for (const envFile of candidatePaths) {
    try {
      if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const idx = trimmed.indexOf("=");
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }
}

loadEnvFiles();

export function getCentralDbUrl(): string {
  loadEnvFiles();
  const env = process.env;
  const envKeys = Object.keys(env);

  const supabaseCandidateKeys = [
    "POSTGRES_PRISMA_URL",
    "SUPABASE_POSTGRES_PRISMA_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "SUPABASE_POSTGRES_URL",
    "SUPABASE_DATABASE_URL",
    "POSTGRES_URL_NON_POOLING",
    "SUPABASE_POSTGRES_URL_NON_POOLING",
    "DIRECT_URL",
  ];

  let bestKey = supabaseCandidateKeys.find(
    (k) => env[k] && typeof env[k] === "string" && env[k]!.trim().length > 0 && !env[k]!.includes("localhost:5432")
  );

  if (!bestKey) {
    bestKey = envKeys.find(
      (k) =>
        k.toUpperCase().includes("SUPABASE") &&
        (k.includes("PRISMA_URL") || k.includes("DATABASE_URL") || k.includes("POSTGRES_URL")) &&
        env[k] &&
        typeof env[k] === "string" &&
        env[k]!.trim().length > 0 &&
        !env[k]!.includes("localhost:5432")
    );
  }

  if (!bestKey && env.DATABASE_URL && !env.DATABASE_URL.includes("vercel-storage.com") && !env.DATABASE_URL.includes("localhost:5432")) {
    bestKey = "DATABASE_URL";
  }

  let dbUrl = (bestKey ? env[bestKey]?.trim() : undefined) || SUPABASE_DEFAULT_CENTRAL_URL;

  // If custom schema is specified in env (e.g. DATABASE_SCHEMA=central)
  if (process.env.DATABASE_SCHEMA && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://") || dbUrl.startsWith("prisma://"))) {
    try {
      const urlObj = new URL(dbUrl);
      if (!urlObj.searchParams.has("schema")) {
        urlObj.searchParams.set("schema", process.env.DATABASE_SCHEMA);
        dbUrl = urlObj.toString();
      }
    } catch {
      if (!dbUrl.includes("schema=")) {
        dbUrl += (dbUrl.includes("?") ? "&" : "?") + `schema=${process.env.DATABASE_SCHEMA}`;
      }
    }
  }

  process.env.DATABASE_URL = dbUrl;
  return dbUrl;
}

const centralDbUrl = getCentralDbUrl();

export const prisma =
  global.centralPrisma ||
  new PrismaClient({
    datasources: { db: { url: centralDbUrl } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.centralPrisma = prisma;
}

export default prisma;
