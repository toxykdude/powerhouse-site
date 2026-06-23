/**
 * trainers.ts — single source of truth for trainer data.
 *
 * Consumed by:
 *  - src/pages/index.astro (homepage cards)
 *  - src/pages/entrenadores/[slug].astro (detail pages)
 *
 * Display order (homepage grid): Juan Manuel Cano, Esteban Morales,
 * Harold Giraldo, Brayan Molina. A record has a detail page iff it
 * carries a `slug` (Juan Manuel omits it).
 */

export type Specialty = string;
export type Currency = "COP";

/** A personal-training pricing tier rendered via PlanCard.astro. */
export interface PricingTier {
	/** Tier identity, e.g. "16 clases/mes" (rendered as the card <h3>). */
	name: string;
	/** Digits only, no "$" / "COP" — e.g. "350.000" (PlanCard adds them). */
	price: string;
	currency: Currency;
	/** Rendered after the amount. OMITTED for trainer tiers (name already says /mes). */
	period?: string;
	/** True ONLY on the 16-class tier (featured card). */
	isFeatured: boolean;
	/** The four identical included features (see SHARED_FEATURES). */
	features: string[];
	/** Full raw ES message; the detail page URL-encodes it for wa.me. */
	whatsappText: string;
}

/**
 * A single metric rendered in the "Estadísticas y Resultados" section
 * of a trainer detail page (see TrainerStats.astro).
 */
export interface TrainerStat {
	/** Which inline SVG icon to render. */
	icon: "hours" | "clients" | "satisfaction" | "certifications";
	/** Display value, e.g. "1,200+" or "96.8%". */
	value: string;
	/** Uppercase Spanish label, e.g. "HORAS ENTRENADAS". */
	label: string;
	/** Optional growth badge text, e.g. "+12%". */
	growth?: string;
	/** Optional 0–100 progress value; renders an indicator when present. */
	progress?: number;
	/** Indicator style when progress is set. Default "bar". */
	progressVariant?: "bar" | "radial";
}

/** A trainer record. Optional fields gate detail-page generation. */
export interface Trainer {
	name: string;
	role: string;
	/** Short copy for the homepage card. */
	bio: string;
	specialties: Specialty[];
	/** OPTIONAL — Brayan omits (renders a placeholder, never a broken <img>). */
	photo?: string;
	alt?: string;
	/** OPTIONAL — presence == "has a detail page". Juan Manuel omits. */
	slug?: string;
	/** Paragraphs for the detail page. Required when slug is present. */
	extendedBio?: string[];
	/** Exactly 3 tiers. Required when slug is present. */
	pricing?: PricingTier[];
	/** The 4 standard metrics. Required when slug is present (detail page renders it). */
	stats?: TrainerStat[];
	/** Per-trainer <title> for the detail page (Base.astro). */
	seoTitle?: string;
	/** Per-trainer meta description for the detail page (Base.astro). */
	seoDescription?: string;
}

/** WhatsApp number shared by every trainer pricing CTA (matches site footer). */
export const WHATSAPP_NUMBER = "573154711900";

/** The four identical included features, exact wording (spec pricing-cards R4). */
export const SHARED_FEATURES: string[] = [
	"Esquema de alimentación con conteo de macros",
	"Estructura de plan de entrenamiento individual",
	"Valoración antropométrica y acompañamiento",
	"Resultados desde la 4ta semana",
];

/**
 * The owner-provided standard metrics shared by every slugged trainer.
 * NOTE: values are identical across trainers for now — the owner will
 * customize per trainer once real per-trainer numbers are available.
 */
const STANDARD_STATS: TrainerStat[] = [
	{ icon: "hours", value: "1,200+", label: "HORAS ENTRENADAS", growth: "+12%" },
	{
		icon: "clients",
		value: "45",
		label: "MIEMBROS ACTIVOS",
		growth: "+8%",
		progress: 90,
		progressVariant: "bar",
	},
	{
		icon: "satisfaction",
		value: "96.8%",
		label: "ÍNDICE DE SATISFACCIÓN",
		progress: 96.8,
		progressVariant: "radial",
	},
	{ icon: "certifications", value: "8", label: "CERTIFICACIONES AVANZADAS", growth: "+2" },
];

/**
 * Build the 3 tiers for a slugged trainer from §B prices.
 * Only name/price/isFeatured/whatsappText vary per tier; currency and
 * the 4 shared features are identical across every trainer and tier.
 */
function buildPricing(
	trainerName: string,
	prices: { twelve: string; sixteen: string; twenty: string },
): PricingTier[] {
	const tiers = [
		{ name: "12 clases/mes", price: prices.twelve, isFeatured: false },
		{ name: "16 clases/mes", price: prices.sixteen, isFeatured: true },
		{ name: "20 clases/mes", price: prices.twenty, isFeatured: false },
	];
	return tiers.map((tier) => ({
		name: tier.name,
		price: tier.price,
		currency: "COP" as Currency,
		isFeatured: tier.isFeatured,
		features: SHARED_FEATURES,
		whatsappText: `Hola PowerHouse, me interesa el plan de ${tier.name} de entrenamiento personal con ${trainerName}. ¿Me das información sobre disponibilidad y inicio?`,
	}));
}

export const trainers: Trainer[] = [
	{
		name: "Juan Manuel Cano",
		role: "Founder & CEO de PowerHouse",
		bio: "Fisiculturista con 16 años de experiencia en el gremio. Fundador de PowerHouse Gym Manizales.",
		specialties: ["Fisiculturismo", "Hipertrofia", "Nutrición Deportiva", "Transformación Corporal"],
		photo: "/uploads/juan-manoel-cano.png",
		alt: "Juan Manuel Cano, fundador y entrenador personal de PowerHouse Gym Manizales, especialista en fisiculturismo e hipertrofia",
	},
	{
		name: "Esteban Morales",
		role: "Entrenador Personal PowerHouse",
		bio: "Especialista en Biomecánica Aplicada al Entrenamiento Personal y Pérdida de Peso. 500+ clientes transformados.",
		specialties: ["Biomecánica", "Pérdida de Peso", "Fuerza", "Prevención de Lesiones"],
		photo: "/uploads/esteban-morales.png",
		alt: "Esteban Morales, entrenador personal certificado en PowerHouse Gym Manizales, especialista en biomecánica y pérdida de peso",
		slug: "esteban-morales",
		extendedBio: [
			"Especialista en Biomecánica Aplicada al Entrenamiento Personal y Pérdida de Peso. Analiza la postura y los patrones de movimiento de cada cliente para diseñar rutinas seguras, eficientes y orientadas a resultados sostenibles.",
			"Con más de 500 clientes transformados, su método integra fuerza, técnica y hábitos para que cada persona alcance su mejor versión y mantenga sus resultados en el tiempo.",
		],
		pricing: buildPricing("Esteban Morales", { twelve: "270.000", sixteen: "350.000", twenty: "400.000" }),
		stats: STANDARD_STATS,
		seoTitle: "Esteban Morales · Entrenador Personal",
		seoDescription:
			"Conoce a Esteban Morales, especialista en biomecánica y pérdida de peso en PowerHouse Gym Manizales. Más de 500 clientes transformados con técnica y resultados sostenibles.",
	},
	{
		name: "Harold Giraldo",
		role: "Preparador Físico",
		bio: "Preparador Físico y Tecnólogo en Entrenamiento Deportivo con amplio conocimiento en funcional y musculación.",
		specialties: ["Funcional", "Musculación", "Wellness", "Core"],
		photo: "/uploads/harold-giraldo.png",
		alt: "Harold Giraldo, preparador físico en PowerHouse Gym Manizales, especialista en entrenamiento funcional y musculación",
		slug: "harold-giraldo",
		extendedBio: [
			"Preparador Físico y Tecnólogo en Entrenamiento Deportivo. Su enfoque combina entrenamiento funcional y musculación con control técnico riguroso, diseñando programas que se ajustan al nivel y al objetivo de cada persona.",
			"Acompaña a cada cliente desde la valoración inicial hasta el seguimiento semanal, priorizando la ejecución correcta de cada movimiento para maximizar resultados y reducir el riesgo de lesión.",
		],
		pricing: buildPricing("Harold Giraldo", { twelve: "270.000", sixteen: "350.000", twenty: "400.000" }),
		stats: STANDARD_STATS,
		seoTitle: "Harold Giraldo · Preparador Físico",
		seoDescription:
			"Conoce a Harold Giraldo, preparador físico y tecnólogo en entrenamiento deportivo en PowerHouse Gym Manizales. Entrenamiento funcional y musculación con seguimiento personalizado.",
	},
	{
		name: "Brayan Molina",
		role: "Entrenador Personal",
		bio: "Técnico Laboral en Preparación Física y Entrenamiento Deportivo con 7 años de trayectoria. Especialista en composición corporal, nutrición deportiva y culturismo natural.",
		specialties: [
			"Composición Corporal",
			"Nutrición Deportiva",
			"Culturismo Natural",
			"Alto Rendimiento",
			"Entrenamiento Femenino",
			"Adulto Mayor",
		],
		slug: "brayan-molina",
		photo: "/uploads/brayan-molina.webp",
		alt: "Brayan Molina, entrenador personal en PowerHouse Gym Manizales, especialista en composición corporal y culturismo natural",
		extendedBio: [
			"Técnico Laboral en Preparación Física y Entrenamiento Deportivo con 7 años de trayectoria como entrenador de planta y personalizado, además de contar con más de 5 diplomados en nutrición, alimentación y métodos de periodización y dosificación de la carga.",
			"Impulsado por la filosofía del culturismo natural, se especializa con amplia experiencia en la modificación de la composición corporal (bajar grasa y ganar músculo) con un enfoque estricto en la salud, el bienestar y la longevidad. Su formación científica y versatilidad le permiten diseñar programas de alta precisión adaptados al entrenamiento de la mujer, el adulto mayor y el alto rendimiento deportivo, logrando resultados reales y sostenibles sin atajos perjudiciales.",
		],
		pricing: buildPricing("Brayan Molina", { twelve: "300.000", sixteen: "380.000", twenty: "420.000" }),
		stats: STANDARD_STATS,
		seoTitle: "Brayan Molina · Entrenador Personal",
		seoDescription:
			"Conoce a Brayan Molina, entrenador personal en PowerHouse Gym Manizales. Especialista en composición corporal, nutrición deportiva y culturismo natural con enfoque en salud y longevidad.",
	},
];
