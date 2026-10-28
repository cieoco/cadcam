// 卡榫盒子外掛入口：app 載入後呼叫 openBoxMaker({source, initialRoot, onConfirm})。
import {openBoxDialog} from './box-dialog.js';
export const openBoxMaker = options => openBoxDialog(options);
