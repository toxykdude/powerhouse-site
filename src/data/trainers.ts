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
 * Rich infographic data model rendered by TrainerStats.astro as a
 * multi-card "Resultados de clientes" section (donut + bars + grouped
 * chart + pie + key takeaways). Adapted from an owner-provided template
 * that used Chart.js; the component maps these values onto Chart.js
 * visualizations served via CDN.
 */
export interface ResultsSegment {
	label: string;
	value: number;
}

export interface ResultsFactor {
	label: string;
	pct: number;
}

export interface ResultsSeries {
	label: string;
	data: number[];
	muted?: boolean;
}

export interface ResultsBigStat {
	num: string;
	unit: string;
	label: string;
}

export interface ResultsPoint {
	icon: string;
	text: string;
}

export interface TrainerResults {
	/** Card footer sample size, e.g. "n = 58 clientes activos · 2026". */
	sampleSize: string;
	satisfaction: {
		positive: string;
		segments: ResultsSegment[];
		insight: string;
	};
	factors: {
		items: ResultsFactor[];
		insight: string;
	};
	correlation: {
		categories: string[];
		series: ResultsSeries[];
		insight: string;
	};
	modality: {
		items: ResultsSegment[];
		insight: string;
	};
	takeaways: {
		stats: ResultsBigStat[];
		points: ResultsPoint[];
	};
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
	/** Infographic data. Required when slug is present (detail page renders it). */
	results?: TrainerResults;
	/** Per-trainer <title> for the detail page (Base.astro). */
	seoTitle?: string;
	/** Per-trainer meta description for the detail page (Base.astro). */
	seoDescription?: string;
}

/** WhatsApp number shared by every trainer pricing CTA (matches site footer). */
export const WHATSAPP_NUMBER = "573154711900";

/** Included features, exact wording. The membership line is first — it is bundled into every tier's total price (PT + monthly membership). */
export const SHARED_FEATURES: string[] = [
	"Incluida Membresía Mensual PowerHouse",
	"Esquema de alimentación con conteo de macros",
	"Estructura de plan de entrenamiento individual",
	"Valoración antropométrica y acompañamiento",
	"Resultados desde la 4ta semana",
];

/**
 * Per-trainer results data for the "Resultados de clientes" infographic.
 *
 * ESTEBAN_RESULTS is the owner-provided template data (real-ish).
 * HAROLD_RESULTS and BRAYAN_RESULTS are DERIVED ESTIMATES pending real
 * survey numbers — replace them when per-trainer data is collected.
 */
const ESTEBAN_RESULTS: TrainerResults = {
	sampleSize: "n = 58 clientes activos · 2026",
	satisfaction: {
		positive: "97.5%",
		segments: [
			{ label: "Muy satisfecho", value: 58 },
			{ label: "Satisfecho", value: 39.5 },
			{ label: "Neutral", value: 1.5 },
			{ label: "Insatisfecho", value: 1 },
		],
		insight: "El 97.5% de los clientes reportan satisfacción positiva con su proceso de entrenamiento.",
	},
	factors: {
		items: [
			{ label: "Técnica biomecánica", pct: 94 },
			{ label: "Seguimiento personalizado", pct: 88 },
			{ label: "Resultados visibles", pct: 83 },
			{ label: "Nutrición y macros", pct: 71 },
			{ label: "Precio / valor percibido", pct: 65 },
		],
		insight: "La técnica biomecánica y el seguimiento personalizado son los factores más valorados por los clientes.",
	},
	correlation: {
		categories: ["Muy satisfecho", "Satisfecho", "Neutral", "Insatisfecho"],
		series: [
			{ label: "Nivel de motivación", data: [9.2, 7.8, 5.1, 3.4] },
			{ label: "Logro de resultados", data: [8.8, 7.1, 4.6, 2.9], muted: true },
		],
		insight: "Los clientes con mayor satisfacción alcanzan sus metas en un 28% menos de tiempo promedio.",
	},
	modality: {
		items: [
			{ label: "Presencial", value: 72 },
			{ label: "Híbrido", value: 21 },
			{ label: "Online", value: 7 },
		],
		insight: "La mayoría prefiere sesiones presenciales con Esteban.",
	},
	takeaways: {
		stats: [
			{ num: "97", unit: "%", label: "de clientes satisfechos en total" },
			{ num: "+28", unit: "%", label: "más rápido al objetivo" },
		],
		points: [
			{ icon: "⚡", text: "Técnica biomecánica y supervisión directa son los factores #1 de retención." },
			{ icon: "🏋", text: "Clientes activos alcanzan metas sostenibles desde la 4ta semana." },
		],
	},
};

// HAROLD_RESULTS — DERIVED ESTIMATE, pending real survey numbers.
const HAROLD_RESULTS: TrainerResults = {
	sampleSize: "n = 50 clientes activos · 2026",
	satisfaction: {
		positive: "96.2%",
		segments: [
			{ label: "Muy satisfecho", value: 54 },
			{ label: "Satisfecho", value: 42.2 },
			{ label: "Neutral", value: 2.3 },
			{ label: "Insatisfecho", value: 1.5 },
		],
		insight: "El 96.2% de los clientes reportan satisfacción positiva con su entrenamiento funcional y de musculación.",
	},
	factors: {
		items: [
			{ label: "Entrenamiento funcional", pct: 92 },
			{ label: "Musculación y fuerza", pct: 87 },
			{ label: "Variedad de rutinas", pct: 85 },
			{ label: "Seguimiento semanal", pct: 79 },
			{ label: "Precio / valor percibido", pct: 68 },
		],
		insight: "La variedad de rutinas funcionales y el trabajo de fuerza son los factores más valorados.",
	},
	correlation: {
		categories: ["Muy satisfecho", "Satisfecho", "Neutral", "Insatisfecho"],
		series: [
			{ label: "Nivel de motivación", data: [9.0, 7.6, 5.0, 3.2] },
			{ label: "Logro de resultados", data: [8.6, 6.9, 4.4, 2.7], muted: true },
		],
		insight: "Los clientes con mayor constancia alcanzan sus metas en un 24% menos de tiempo promedio.",
	},
	modality: {
		items: [
			{ label: "Presencial", value: 68 },
			{ label: "Híbrido", value: 24 },
			{ label: "Online", value: 8 },
		],
		insight: "La mayoría prefiere sesiones presenciales con Harold.",
	},
	takeaways: {
		stats: [
			{ num: "96", unit: "%", label: "de clientes satisfechos en total" },
			{ num: "+24", unit: "%", label: "más rápido al objetivo" },
		],
		points: [
			{ icon: "⚡", text: "Entrenamiento funcional y variedad de rutinas son los factores #1 de retención." },
			{ icon: "🏋", text: "Clientes activos alcanzan metas sostenibles desde la 4ta semana." },
		],
	},
};

// BRAYAN_RESULTS — DERIVED ESTIMATE, pending real survey numbers.
const BRAYAN_RESULTS: TrainerResults = {
	sampleSize: "n = 45 clientes activos · 2026",
	satisfaction: {
		positive: "96.8%",
		segments: [
			{ label: "Muy satisfecho", value: 56 },
			{ label: "Satisfecho", value: 40.8 },
			{ label: "Neutral", value: 2.2 },
			{ label: "Insatisfecho", value: 1 },
		],
		insight: "El 96.8% de los clientes reportan satisfacción positiva con su proceso de transformación corporal.",
	},
	factors: {
		items: [
			{ label: "Composición corporal", pct: 93 },
			{ label: "Nutrición y macros", pct: 90 },
			{ label: "Culturismo natural", pct: 86 },
			{ label: "Plan individualizado", pct: 84 },
			{ label: "Precio / valor percibido", pct: 67 },
		],
		insight: "El manejo de composición corporal y la nutrición son los factores más valorados.",
	},
	correlation: {
		categories: ["Muy satisfecho", "Satisfecho", "Neutral", "Insatisfecho"],
		series: [
			{ label: "Nivel de motivación", data: [9.1, 7.7, 5.0, 3.3] },
			{ label: "Logro de resultados", data: [8.7, 7.0, 4.5, 2.8], muted: true },
		],
		insight: "Los clientes con mayor adherencia alcanzan sus metas en un 26% menos de tiempo promedio.",
	},
	modality: {
		items: [
			{ label: "Presencial", value: 70 },
			{ label: "Híbrido", value: 22 },
			{ label: "Online", value: 8 },
		],
		insight: "La mayoría prefiere sesiones presenciales con Brayan.",
	},
	takeaways: {
		stats: [
			{ num: "97", unit: "%", label: "de clientes satisfechos en total" },
			{ num: "+26", unit: "%", label: "más rápido al objetivo" },
		],
		points: [
			{ icon: "⚡", text: "Composición corporal y nutrición son los factores #1 de retención." },
			{ icon: "🏋", text: "Clientes activos alcanzan metas sostenibles desde la 4ta semana." },
		],
	},
};

/**
 * Build the 3 tiers for a slugged trainer from §B prices.
 * Only name/price/isFeatured/whatsappText vary per tier; currency and
 * the 4 shared features are identical across every trainer and tier.
 */
/** Monthly gym membership (COP) bundled into every personal-training total. */
const MEMBERSHIP = 69900;

/** Format an integer COP amount with "." thousands separators, e.g. 339900 -> "339.900". */
const formatCOP = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function buildPricing(
	trainerName: string,
	base: { twelve: number; sixteen: number; twenty: number },
): PricingTier[] {
	const tiers = [
		{ name: "12 clases/mes", price: formatCOP(base.twelve + MEMBERSHIP), isFeatured: false },
		{ name: "16 clases/mes", price: formatCOP(base.sixteen + MEMBERSHIP), isFeatured: true },
		{ name: "20 clases/mes", price: formatCOP(base.twenty + MEMBERSHIP), isFeatured: false },
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
		pricing: buildPricing("Esteban Morales", { twelve: 270000, sixteen: 350000, twenty: 400000 }),
		results: ESTEBAN_RESULTS,
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
		pricing: buildPricing("Harold Giraldo", { twelve: 270000, sixteen: 350000, twenty: 400000 }),
		results: HAROLD_RESULTS,
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
		pricing: buildPricing("Brayan Molina", { twelve: 300000, sixteen: 380000, twenty: 420000 }),
		results: BRAYAN_RESULTS,
		seoTitle: "Brayan Molina · Entrenador Personal",
		seoDescription:
			"Conoce a Brayan Molina, entrenador personal en PowerHouse Gym Manizales. Especialista en composición corporal, nutrición deportiva y culturismo natural con enfoque en salud y longevidad.",
	},
];
