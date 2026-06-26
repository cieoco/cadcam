/**
 * Generic Multilink Definition (Jansen Example)
 * 定義 Jansen 機構的拓撲結構
 */
export const JANSEN_TOPOLOGY = {
    // 定義求解步驟
    steps: [
        // 1. 固定點
        { id: 'F', type: 'ground', x: 0, y: 0 },
        { id: 'O', type: 'ground', x: 38, y: 7.8 }, // crank center: a=38, l=7.8 from F

        // 2. 輸入曲柄 (P0)
        { id: 'P0', type: 'input_crank', center: 'O', len_param: 'm' },

        // 3. 上節點 (P1): connect O-P0 (extend j) & F (extend b). P1 is "upper".
        // Note: Sign convention needs manual tuning or matching visualization.
        { id: 'P1', type: 'dyad', p1: 'P0', r1_param: 'j', p2: 'F', r2_param: 'b', sign: -1 },

        // 4. 下節點 (P2): connect O-P0 (extend k) & F (extend c). P2 is "lower".
        { id: 'P2', type: 'dyad', p1: 'P0', r1_param: 'k', p2: 'F', r2_param: 'c', sign: 1 },

        // 5. 上三角左角 (P3): fixed triangle F-P1-P3 uses b, d, e.
        { id: 'P3', type: 'dyad', p1: 'P1', r1_param: 'e', p2: 'F', r2_param: 'd', sign: -1 },

        // 6. 下三角左角 (P4): connects the upper triangle to lower triangle by f and g.
        { id: 'P4', type: 'dyad', p1: 'P3', r1_param: 'f', p2: 'P2', r2_param: 'g', sign: -1 },

        // 7. 腳底 (P5): lower fixed triangle P2-P4-P5 uses g, h, i.
        { id: 'P5', type: 'dyad', p1: 'P4', r1_param: 'h', p2: 'P2', r2_param: 'i', sign: -1 }
    ],

    tracePoint: 'P5',

    // 視覺化定義: 告訴 renderer 畫什麼
    visualization: {
        links: [
            { p1: 'O', p2: 'F', style: 'dashed', color: '#bdc3c7' }, // Ground
            { p1: 'O', p2: 'P0', style: 'crank', color: '#e74c3c' }, // Crank m
            { p1: 'P0', p2: 'P1', color: '#34495e' }, // j
            { p1: 'P0', p2: 'P2', color: '#34495e' }, // k
            { p1: 'F', p2: 'P1', color: '#95a5a6' },  // b
            { p1: 'F', p2: 'P2', color: '#95a5a6' },  // c
            { p1: 'F', p2: 'P3', color: '#2ecc71' },  // d
            { p1: 'P1', p2: 'P3', color: '#2ecc71' }, // e
            { p1: 'P3', p2: 'P4', color: '#2ecc71' }, // f
            { p1: 'P2', p2: 'P4', color: '#e67e22' }, // g
            { p1: 'P2', p2: 'P5', color: '#e67e22' }, // i
            { p1: 'P4', p2: 'P5', color: '#e67e22' }, // h
        ],
        polygons: [
            // Holy numbers: upper b-d-e triangle and lower g-h-i triangle.
            { points: ['F', 'P1', 'P3'], fill: '#3498db', stroke: '#2980b9' },
            { points: ['P2', 'P4', 'P5'], fill: '#3498db', stroke: '#2980b9' }
        ],
        joints: ['O', 'F', 'P0', 'P1', 'P2', 'P3', 'P4', 'P5']
    },

    // 零件生成定義: 告訴 parts generator 如何拆解
    parts: [
        { id: 'Crank(m)', type: 'bar', len_param: 'm', color: '#e74c3c' },
        { id: 'Link(j)', type: 'bar', len_param: 'j' },
        { id: 'Link(k)', type: 'bar', len_param: 'k' },
        { id: 'Link(b)', type: 'bar', len_param: 'b' },
        { id: 'Link(c)', type: 'bar', len_param: 'c' },
        // ... bars

        // Triangle Plates
        {
            id: 'UpperLeg',
            type: 'triangle',
            len_params: ['b', 'd', 'e'],
            nodes: ['F', 'P1', 'P3']
        },
        {
            id: 'LowerLeg',
            type: 'triangle',
            len_params: ['g', 'h', 'i'],
            nodes: ['P2', 'P4', 'P5']
        }
    ]
};

// 經典 Theo Jansen 腿比例（mm）。固定幾何在 topology ground 點中：
// F = (0, 0)，曲柄中心 O = (a, l) = (38, 7.8)，曲柄半徑 m = 15。
export const JANSEN_DEFAULT_PARAMS = {
    a: 38,
    l: 7.8,
    m: 15,
    j: 50,
    k: 61.9,
    b: 41.5,
    c: 39.3,
    e: 55.8,
    d: 40.1,
    f: 39.4,
    g: 36.7,
    h: 65.7,
    i: 49
};
