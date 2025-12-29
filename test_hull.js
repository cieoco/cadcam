
function solveTriangleVertex(b, a, c) {
    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    return { x: b * cosA, y: b * sinA };
}

function computeTangentHullPath(circles) {
    if (!circles || circles.length < 2) return "";

    const getTangent = (c1, c2) => {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return null;

        const nx = dy / dist;
        const ny = -dx / dist;

        const r1 = c1.r;
        const r2 = c2.r;

        return {
            start: { x: c1.x + nx * r1, y: c1.y + ny * r1 },
            end: { x: c2.x + nx * r2, y: c2.y + ny * r2 }
        };
    };

    let d = "";
    const n = circles.length;
    const tangents = [];
    for (let i = 0; i < n; i++) {
        const c1 = circles[i];
        const c2 = circles[(i + 1) % n];
        const t = getTangent(c1, c2);
        if (t) tangents.push(t);
    }

    if (tangents.length !== n) return "ERROR: Not enough tangents";

    for (let i = 0; i < n; i++) {
        const curr = tangents[i];
        const next = tangents[(i + 1) % n];
        const cNext = circles[(i + 1) % n];

        if (i === 0) {
            d += `M ${curr.start.x.toFixed(2)} ${curr.start.y.toFixed(2)} `;
        }
        d += `L ${curr.end.x.toFixed(2)} ${curr.end.y.toFixed(2)} `;
        // Note: SVG Arc command parameters are (rx ry x-axis-rotation large-arc-flag sweep-flag x y)
        // Here we just print the target point to verify geometry
        d += `A ${cNext.r.toFixed(2)} ${cNext.r.toFixed(2)} 0 0 0 ${next.start.x.toFixed(2)} ${next.start.y.toFixed(2)} `;
    }
    d += "Z";
    return d;
}

const len1 = 100;
const len2 = 112;
const len3 = 112;
const margin = 6;
const holeD = 3.2;
const r = holeD / 2 + margin;

const v = solveTriangleVertex(len2, len3, len1);
console.log(`Vertex: ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);

const circles = [
    { x: 0, y: 0, r: r },
    { x: len1, y: 0, r: r },
    { x: v.x, y: v.y, r: r }
];

console.log(`Circles:`, circles);
console.log(`Path:`, computeTangentHullPath(circles));
