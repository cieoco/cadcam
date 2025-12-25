/**
 * Generic Multilink Definition (Jansen Example)
 * 定義 Jansen 機構的拓撲結構
 */
export const JANSEN_TOPOLOGY = {
    // 定義求解步驟
    steps: [
        // 1. 固定點
        { id: 'O', type: 'ground', x: 0, y: 0 },
        { id: 'F', type: 'ground', x: -38, y: -7.8 }, // Jansen fixed point relative to crank

        // 2. 輸入曲柄 (P0)
        { id: 'P0', type: 'input_crank', center: 'O', len_param: 'm' },

        // 3. 上節點 (P1): connect O-P0 (extend j) & F (extend b). P1 is "upper".
        // Note: Sign convention needs manual tuning or matching visualization.
        { id: 'P1', type: 'dyad', p1: 'P0', r1_param: 'j', p2: 'F', r2_param: 'b', sign: -1 },

        // 4. 下節點 (P2): connect O-P0 (extend k) & F (extend c). P2 is "lower".
        { id: 'P2', type: 'dyad', p1: 'P0', r1_param: 'k', p2: 'F', r2_param: 'c', sign: 1 },

        // 5. 肩關節 (P3): connecting P1 (e) and P2 (d).
        // This forms the central deformable quad/triangle structure.
        { id: 'P3', type: 'dyad', p1: 'P1', r1_param: 'e', p2: 'P2', r2_param: 'd', sign: -1 },

        // 6. 上外角 (P4): connecting P1 (f) and P3 (a_len). 
        // Note: P1-P3-P4 is a rigid triangle plate usually. 
        // Solving P4 relative to P1, P3 using lengths f, a_len.
        { id: 'P4', type: 'dyad', p1: 'P1', r1_param: 'f', p2: 'P3', r2_param: 'a_len', sign: -1 },

        // 7. 腳底 (P5): connecting P4 (h) and P2 (i).
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
            { p1: 'P2', p2: 'P3', color: '#2ecc71' }, // d
            { p1: 'P2', p2: 'P5', color: '#e67e22' }, // i
            { p1: 'P4', p2: 'P5', color: '#e67e22' }, // h
        ],
        polygons: [
            // Upper Triangle Plate
            { points: ['P1', 'P3', 'P4'], fill: '#3498db', stroke: '#2980b9' }
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

        // Triangle Plate
        {
            id: 'UpperLeg',
            type: 'triangle',
            len_params: ['e', 'f', 'a_len'], // Side lengths: P1-P3, P1-P4, P3-P4
            // We need to know which one is the "Base" for simple generation?
            // Solver in parts.js will assemble triangle from 3 lengths.
            nodes: ['P1', 'P3', 'P4'] // Used to verifying
        }
    ]
};
