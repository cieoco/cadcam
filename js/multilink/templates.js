/**
 * Multilink Mechanism Templates
 */

export const KLANN_TOPOLOGY = {
    steps: [
        { id: 'O', type: 'ground', x: 0, y: 0 },
        { id: 'F', type: 'ground', x: 25, y: 10 },
        { id: 'P0', type: 'input_crank', center: 'O', len_param: 'm' },
        { id: 'P1', type: 'dyad', p1: 'P0', r1_param: 'j', p2: 'F', r2_param: 'b', sign: 1 },
        { id: 'P2', type: 'dyad', p1: 'P1', r1_param: 'e', p2: 'F', r2_param: 'd', sign: -1 },
        { id: 'P3', type: 'dyad', p1: 'P2', r1_param: 'f', p2: 'P1', r2_param: 'g', sign: 1 }
    ],
    tracePoint: 'P3',
    visualization: {
        links: [
            { p1: 'O', p2: 'P0', style: 'crank', color: '#e74c3c' },
            { p1: 'P0', p2: 'P1', color: '#34495e' },
            { p1: 'F', p2: 'P1', color: '#95a5a6' },
            { p1: 'F', p2: 'P2', color: '#95a5a6' },
            { p1: 'P1', p2: 'P2', color: '#2ecc71' },
            { p1: 'P2', p2: 'P3', color: '#e67e22' },
            { p1: 'P1', p2: 'P3', color: '#e67e22' }
        ],
        joints: ['O', 'F', 'P0', 'P1', 'P2', 'P3']
    },
    parts: [
        { id: 'Crank', type: 'bar', len_param: 'm' },
        { id: 'Link_j', type: 'bar', len_param: 'j' },
        { id: 'Link_b', type: 'bar', len_param: 'b' }
    ]
};

export const HOEKEN_TOPOLOGY = {
    steps: [
        { id: 'O', type: 'ground', x: 0, y: 0 },
        { id: 'F', type: 'ground', x: 50, y: 0 },
        { id: 'P0', type: 'input_crank', center: 'O', len_param: 'r' },
        { id: 'P1', type: 'dyad', p1: 'P0', r1_param: 'L1', p2: 'F', r2_param: 'L2', sign: 1 }
    ],
    tracePoint: 'P1',
    visualization: {
        links: [
            { p1: 'O', p2: 'P0', style: 'crank', color: '#e74c3c' },
            { p1: 'P0', p2: 'P1', color: '#34495e' },
            { p1: 'F', p2: 'P1', color: '#95a5a6' }
        ],
        joints: ['O', 'F', 'P0', 'P1']
    },
    parts: [
        { id: 'Crank', type: 'bar', len_param: 'r' },
        { id: 'Link1', type: 'bar', len_param: 'L1' },
        { id: 'Link2', type: 'bar', len_param: 'L2' }
    ]
};
