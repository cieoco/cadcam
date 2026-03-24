/**
 * Mechanism Templates Registry
 * 定義所有可用的機構範本與其對應的 JSON 檔案路徑
 */

export const EXAMPLE_TEMPLATES = [
    {
        id: 'parallel-fourbar',
        name: '四連桿 (平行)',
        file: './js/examples/parallel-fourbar.json', // 相對於 HTML 根目錄的路徑
        learningGoal: '理解平行四邊形四連桿如何保持輸出桿姿態，並觀察輸入半徑與連桿長度對運動的影響。',
        keyParams: ['R', 'L'],
        commonFailure: '若固定點距離、輸入半徑與連桿長度比例不合理，會讓閉環無法形成或輸出行程過小。',
        nextStep: '確認運動方向後，可把連桿尺寸帶到 cad 做板件零件設計。'
    },
    {
        id: 'gripper',
        name: '夾爪機構 (Gripper)',
        file: './js/examples/gripper.json',
        learningGoal: '理解曲柄帶動夾爪開合的閉環關係，觀察 coupler 與 finger 三角形對夾持路徑的影響。',
        keyParams: ['L_Crank', 'L_Coupler', 'L_FingerBase', 'L_FingerTip', 'L_FingerSide'],
        commonFailure: '若 finger 三角形邊長比例不合理，夾爪尖端可能無法形成可用解或開合角度過小。',
        nextStep: '選定夾持範圍後，可把指尖、基座與關節位置轉交 cad 與 arm。'
    },
    {
        id: 'slider-track',
        name: 'Slider Track',
        file: './js/examples/slider-track.json',
        learningGoal: '理解曲柄滑塊如何把旋轉運動轉成近似直線往復，並觀察 crank / rod / slider 幾何關係。',
        keyParams: ['L1', 'L2', 'L3'],
        commonFailure: '若 crank、ground 與 coupler 的比例不合理，滑塊行程會受限，甚至在極限位置附近失效。',
        nextStep: '確認行程與滑軌方向後，可將零件輪廓轉給 cad 與 svg2gcode-project。'
    }
    // 您可以在這裡新增更多範本，例如：
    // { id: 'jansen', name: 'Theo Jansen 仿生獸', file: './js/examples/jansen.json' }
];
