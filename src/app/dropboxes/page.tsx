import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { DropboxBrowser } from "@/components/dropbox-browser";
import { listDropboxes } from "@/lib/dropbox-store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sample dropboxes", description: "Find a SeqForge sample dropbox, check building access and collection information, and choose your drop-off location." };

export default async function DropboxesPage() {
  const locations = await listDropboxes(prisma);
  return <div className="dropboxes-page"><header className="dropboxes-header"><Link href="/" aria-label="SeqForge home"><Image src="/brand/assets/logo.webp" alt="SeqForge" width={160} height={45} className="dropboxes-logo" /></Link><nav aria-label="Dropbox page navigation"><Link href="/contact/">Contact our team</Link><Link href="/login">Log in</Link><Link className="button-primary" href="/orders/new">Start an order</Link></nav></header><main className="dropboxes-main"><Link className="dropboxes-back" href="/"><ArrowLeft size={16} /> Back to SeqForge</Link><div className="dropboxes-intro"><div><p className="eyebrow">From your lab to ours</p><h1>Your samples.<br /><span>A dropbox nearby.</span></h1><p>Find your campus location, check the drop-off details and plan your next sequencing run.</p></div><div className="dropboxes-intro-note"><MapPin size={24} aria-hidden="true" /><p>Choose a location to see directions, collection information and building access. No login needed to explore.</p></div></div><DropboxBrowser locations={locations} /><p className="dropboxes-help">Need help finding a dropbox or arranging another way to send samples? <Link href="/contact/">Contact our team.</Link></p></main><footer className="dropboxes-footer"><span>SeqForge · From samples to discovery.</span><Link href="/orders/new">Prepare your order</Link></footer></div>;
}
