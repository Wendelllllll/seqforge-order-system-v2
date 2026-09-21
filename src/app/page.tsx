import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { MarketingHeader, PricingExplorer, SmoothFaq } from "@/components/marketing-interactions";
import { CoastalScience } from "@/components/coastal-science";
import { MarketingMotion } from "@/components/marketing-motion";
import "./marketing.css";

export const metadata: Metadata = { title: "SeqForge | Forging the Future of Genomic Science", description: "Explore SeqForge Sanger sequencing. Plan tube and plate submissions, estimate sequencing costs, and manage your orders and results in one place." };

const faqs = [
  ["Can I submit both tubes and plates?", "Yes. Create separate orders for individual tubes and 96-well plates. For tubes, enter the physical tube label. For plates, identify each plate and its occupied wells using A1–H12 coordinates."],
  ["How does per-reaction pricing work?", "Each sample–primer combination is a sequencing reaction. Prices depend on your container and submission mode. Partially filled plates are priced by the number of reactions, not as a full plate. The estimator shows sequencing charges; additional services require review."],
  ["Can I import my samples from a spreadsheet?", "Yes. Download the CSV template from the order form for your selected container and mode. Upload a CSV, TSV or TXT file, check the preview, then apply it to fill your sample and primer details. Export Excel workbooks as CSV first."],
  ["Will I have to enter my billing details every time?", "You can save pickup, PI and billing-contact details in your account. New orders prefill those details, and you can adjust them for an individual order. Invoice and purchase order preferences are supported; online card payment is not yet available."],
  ["How do I arrange pickup and receive my results?", "Enter your collection location and instructions with your order. Pickup availability and timing need confirmation with SeqForge; saving a location does not schedule collection. When results are uploaded, you can access them from your order in the customer portal."],
];

export default function Home() {
  return <MarketingMotion>
    <MarketingHeader />
    <main id="main-content">
      <section className="site-hero" aria-labelledby="hero-heading">
        <div className="hero-illustration"><span className="coast-sticker">A little coastal curiosity.</span><CoastalScience /><span className="illustration-caption">SMALL SAMPLES. BIG POSSIBILITIES.</span></div>
        <div className="hero-topline"><span className="site-kicker"><i /> San Diego, California</span><span className="hero-index">PACIFIC COAST / GENOMIC SCIENCE</span></div>
        <h1 id="hero-heading"><span>Your next discovery.</span><span>Starts here.</span></h1>
        <div className="hero-bottom"><div><p>Sanger sequencing for the questions that move your research forward. From a single tube to your next plate, bring it all together with SeqForge.</p><Link href="/orders/new" className="site-button light">Start sequencing <ArrowUpRight size={18} /></Link></div><a href="#services" className="hero-explore">Explore SeqForge <ArrowDown size={17} /></a></div>
      </section>
      <div className="service-strip" aria-label="Sequencing workflow"><span>SANGER SEQUENCING</span><span>INDIVIDUAL TUBES</span><span>96-WELL PLATES</span><span>YOUR SAMPLES. ONE WORKSPACE.</span></div>

      <section id="approach" className="site-section approach-section">
        <div><p className="site-kicker">01 / The SeqForge approach</p><h2>More clarity.<br /><em>At every step.</em></h2></div>
        <div className="approach-copy"><p className="large-copy">Your research is complex.<br />Ordering sequencing should feel simple.</p><p>Prepare your samples, choose your primers, and follow your order through the lab. A connected workspace keeps the details together, so you can focus on the science ahead.</p><Link href="/register" className="site-text-link">Get to know your workspace <ArrowUpRight size={18} /></Link></div>
      </section>

      <section id="services" className="site-section services-section">
        <div className="section-title-row"><div><p className="site-kicker">02 / Built around your samples</p><h2>Small details.<br />Big possibilities.</h2></div><p>Choose how you work.<br />We’ll help you bring the details together.</p></div>
        <div className="service-grid">
          <a href="#pricing" className="service-feature"><div className="service-feature-top"><span className="site-kicker">Sanger sequencing</span><ArrowUpRight /></div><div className="tube-art" aria-hidden="true">{Array.from({length: 5}, (_, i) => <div className="sample-tube" key={i} style={{transform: `translateY(${Math.abs(2-i)*16}px) rotate(-18deg)`}}><i /><span /></div>)}</div><div><span className="service-number">01</span><h3>One tube.<br />Your next answer.</h3><p>For individual samples and focused projects. Capture your DNA details and add the primers you need.</p><span className="service-link">Explore tube pricing <ArrowUpRight size={16} /></span></div></a>
          <a href="#pricing" className="service-feature plate-feature"><div className="service-feature-top"><span className="site-kicker">Sanger sequencing</span><ArrowUpRight /></div><div className="plate-art" aria-hidden="true">{Array.from({length: 96}, (_, i) => <i key={i} className={i % 7 === 0 || i % 11 === 0 ? "well-lit" : ""} />)}</div><div><span className="service-number">02</span><h3>More samples.<br />Same clear path.</h3><p>Organize your 96-well plates with sample locations, bulk import, and transparent per-reaction pricing.</p><span className="service-link">Explore plate pricing <ArrowUpRight size={16} /></span></div></a>
        </div>
        <div className="service-note"><span>Make it yours.</span><p>Standard, pre-mixed, or ready to load. Record preparation and primer-synthesis requests as part of your order for lab review.</p><Link href="/orders/new" aria-label="Explore submission options in the order form"><ArrowUpRight /></Link></div>
      </section>

      <section id="workflow" className="site-section workflow-section"><p className="site-kicker">03 / From sample to result</p><h2>Science in motion.<br /><em>You in the loop.</em></h2><div className="workflow-grid">{[
        ["01", "Prepare your order", "Add samples individually or import a spreadsheet. Choose your primers and review the details before submitting."],
        ["02", "Follow the progress", "Keep your order information, pickup instructions and laboratory status together in your customer portal."],
        ["03", "Find your results", "Return to your order to download available results. Your samples and their sequencing history stay connected."],
      ].map(([n,title,body]) => <article key={n}><span className="workflow-number">{n}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>

      <section id="pricing" className="site-section pricing-section"><div className="section-title-row"><div><p className="site-kicker">04 / A clearer starting point</p><h2>Your experiment.<br />Your estimate.</h2></div><p>Explore the sequencing cost before you order.<br />Adjust the format, mode and reaction count.</p></div><PricingExplorer /></section>

      <section className="workspace-banner"><div className="workspace-orbit" aria-hidden="true"><span /><span /><span /><span /></div><div><p className="site-kicker">Designed for the way labs work</p><h2>Less repetition.<br /><em>More research.</em></h2><p>Save the details that rarely change. Keep pickup locations, your PI and billing contacts ready for your next order.</p><ul><li><Check size={17} /> Reusable account details</li><li><Check size={17} /> Sample and primer spreadsheet import</li><li><Check size={17} /> Orders and results in one place</li></ul><Link href="/account" className="site-button light">Explore your account <ArrowUpRight size={18} /></Link></div></section>

      <section className="site-section story-section" aria-labelledby="story-heading"><div><p className="site-kicker">A closer look</p><h2 id="story-heading">A little science.<br /><em>A lot to explore.</em></h2><p>A space for stories from the lab and a closer look at your sample’s journey.</p></div><div className="media-placeholder" role="img" aria-label="Reserved space for a future lab video"><span className="placeholder-spark" aria-hidden="true">✳</span><span>Something curious is on the horizon.</span><small>Lab video · Coming later</small></div></section>

      <section id="resources" className="site-section faq-section"><div><p className="site-kicker">05 / Good questions</p><h2>A little clarity<br />before you begin.</h2><p>Practical answers for your next submission.</p></div><SmoothFaq items={faqs} /></section>
      <section className="site-cta"><p className="site-kicker">Forging the Future of Genomic Science</p><h2>What will you<br /><em>discover next?</em></h2><Link href="/orders/new" className="site-button light">Let’s start sequencing <ArrowUpRight size={20} /></Link></section>
    </main>
    <footer className="site-footer"><div className="footer-top"><div><Brand /><p>From your next sample<br />to your next discovery.</p></div><nav aria-label="Footer navigation"><a href="#services">Sequencing services</a><a href="#pricing">Explore pricing</a><a href="#resources">Questions & answers</a><Link href="/login">Customer sign in</Link><Link href="/register">Create an account</Link></nav></div><div className="footer-bottom"><span>© {new Date().getFullYear()} SeqForge, Inc.</span><span>San Diego, California · Pacific coast</span><span>Local preview · Orders are for demonstration</span></div></footer>
  </MarketingMotion>;
}
