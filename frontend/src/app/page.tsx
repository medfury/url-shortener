"use client";

import axios from "axios";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Link2,
  Zap,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  ArrowUpRight,
  Globe,
  Server,
  Clock,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const ModeToggle = dynamic(
  () => import("@/components/mode-toggle").then((mod) => mod.ModeToggle),
  { ssr: false },
);

// ── Types ──────────────────────────────────────────────────────────────────
interface Link {
  slug: string;
  url: string;
  title: string | null;
  clicks: number;
  created_pretty: string;
}

interface HealthInfo {
  status: string;
  region: string;
  environment: string;
  uptime: number | string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

function nanoid(n = 6) {
  const c = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: n },
    () => c[Math.floor(Math.random() * c.length)],
  ).join("");
}

function fmtUptime(s: number | null) {
  if (s === null) return "Server offline";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ── Link row ───────────────────────────────────────────────────────────────
function LinkRow({
  link,
  onDelete,
  apiBase,
}: {
  link: Link;
  onDelete: (slug: string) => void;
  apiBase: string;
}) {
  const [copied, setCopied] = useState(false);
  const shortUrl = `${apiBase}/r/${link.slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="group grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 rounded-xl border border-[#2E2850] bg-[#1C1830] px-4 py-3 transition-colors hover:border-[#3D3565]">
      {/* Slug */}
      <code className="rounded-md border border-[#2E2850] bg-[#251F3A] px-2.5 py-1 font-mono text-xs font-semibold text-violet-400">
        {link.slug}
      </code>

      {/* Meta */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#F4F4FF]">
          {link.title ?? link.url}
        </p>
        <p className="truncate text-xs text-[#9CA3AF]">{link.url}</p>
      </div>

      {/* Clicks */}
      <div className="text-center">
        <p className="text-sm font-bold text-emerald-400">{link.clicks}</p>
        <p className="text-[10px] text-[#9CA3AF]">
          click{link.clicks !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Copy */}
      <Button
        variant="outline"
        size="icon"
        onClick={copy}
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Delete */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(link.slug)}
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-[#4B4570] hover:text-red-400 hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const [links, setLinks] = useState<Link[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [uptime, setUptime] = useState<number | null>(null);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    toast({
      title: type === "ok" ? "Success" : "Error",
      description: msg,
      variant: type === "err" ? "destructive" : "default",
    });
  }

  // ── Fetch links ──────────────────────────────────────────────────────────
  const loadLinks = useCallback(async () => {
    try {
      const { data } = await axios.get(`https://${API}/api/links`);
      setLinks(Array.isArray(data) ? data : []);
    } catch {
      // API offline — demo mode
    }
  }, []);

  // ── Health ───────────────────────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
    try {
      const { data } = await axios.get(`https://${API}/health`);
      setHealth(data);
      setUptime(data.uptime);
    } catch {
      /* offline */
      setHealth(null);
      setUptime(null);
    }
  }, []);

  useEffect(() => {
    const initialLoad = async () => {
      await Promise.all([loadLinks(), loadHealth()]);
    };

    void initialLoad();
  }, [loadLinks, loadHealth]);
  useEffect(() => {
    const t = setInterval(() => {
      setUptime((u) => (typeof u === "number" ? u + 1 : u));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(loadHealth, 30_000);
    return () => clearInterval(t);
  }, [loadHealth]);

  // ── Shorten ──────────────────────────────────────────────────────────────
  async function shorten() {
    if (!url.trim()) {
      showToast("Please enter a URL", "err");
      return;
    }
    try {
      new URL(url);
    } catch {
      showToast("Invalid URL", "err");
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`https://${API}/api/links`, {
        url,
        title,
        customSlug: slug || undefined,
      });
      console.log("Create response", data);
      if (!data?.shortUrl) {
        showToast("Something went wrong", "err");
        return;
      }
      setResultUrl(data.shortUrl);
      setUrl("");
      setTitle("");
      setSlug("");
      showToast("Link created!");
      loadLinks();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        showToast(
          error.response?.data?.message || "Failed to create link",
          "err",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteLink(slug: string) {
    try {
      await axios.delete(`https://${API}/api/links/${slug}`);
    } catch {
      /* offline */
    }
    setLinks((prev) => prev.filter((l) => l.slug !== slug));
    showToast("Deleted");
  }

  async function copyResult() {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Copy failed", "err");
    }
  }

  const totalClicks = links.reduce((a, l) => a + l.clicks, 0);

  return (
    <div className="min-h-screen font-sans">
      {/* ── Ambient glow ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-700/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-emerald-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 pb-20 pt-0">
        {/* ── Nav ── */}
        <nav className="flex items-center justify-between border-b border-[#2E2850] py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600">
              <Link2 className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight">RailLink</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Deployed on Railway
            </Badge>
            <ModeToggle />
          </div>
        </nav>

        {/* ── Hero ── */}
        <div className="py-10 text-center">
          <h1 className="mb-2 text-4xl font-extrabold tracking-tight leading-tight">
            Shorten URLs.
            <br />
            <span className="text-violet-600">Powered by Railway.</span>
          </h1>
          <p className="text-sm">
            Full-stack demo · Express API + PostgreSQL + Next.js · one Railway
            project
          </p>
        </div>

        {/* ── Create card ── */}
        <Card className="mb-4 border border-violet-600/30">
          <CardContent className="pt-5 space-y-3">
            {/* URL row */}
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://docs.railway.com/overview/about-railway"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && shorten()}
                className="flex-1"
              />
              <Button
                onClick={shorten}
                disabled={loading}
                className="shrink-0 gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                {loading ? "Working…" : "Shorten"}
              </Button>
            </div>

            {/* Extra row */}
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                placeholder="Custom slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={20}
              />
            </div>

            {/* Result */}
            {resultUrl && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <span className="flex-1 truncate font-mono text-sm font-semibold text-emerald-400">
                  {resultUrl}
                </span>
                <Button
                  size="sm"
                  onClick={copyResult}
                  className="shrink-0 gap-1.5"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Stats row ── */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            {
              label: "Links",
              value: links.length,
              icon: Link2,
              color: "text-violet-400",
            },
            {
              label: "Total clicks",
              value: totalClicks,
              icon: Activity,
              color: "text-emerald-400",
            },
            {
              label: "Uptime",
              value: fmtUptime(uptime),
              icon: Clock,
              color: "text-sky-400",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border border-violet-600/30">
              <CardContent className="flex items-center gap-3 py-4 px-4">
                <Icon className={cn("h-4 w-4 shrink-0", color)} />
                <div>
                  <p className={cn("text-base font-bold leading-none", color)}>
                    {value}
                  </p>
                  <p className="mt-1 text-[10px]">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Links list ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Your links</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadLinks}
              className="h-7 gap-1.5 text-xs"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {links.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#2E2850] py-12 text-center">
              <Link2 className="h-8 w-8 text-[#4B4570]" />
              <p className="text-sm text-[#9CA3AF]">
                No links yet — create one above.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <LinkRow
                  key={link.slug}
                  link={link}
                  onDelete={deleteLink}
                  apiBase={API}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Railway info bar ── */}
        {health && (
          <>
            <Separator className="my-6" />
            <div className="flex flex-wrap gap-2">
              <Badge className="gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Live on Railway
              </Badge>
              <Badge variant="default">
                <Globe className="h-3 w-3" /> {health.region}
              </Badge>
              <Badge variant="default">
                <Server className="h-3 w-3" /> {health.environment}
              </Badge>
              <Badge>
                <ArrowUpRight className="h-3 w-3" /> {fmtUptime(uptime)} uptime
              </Badge>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
