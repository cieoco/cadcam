// 十二個教學單元各自的起始練習檔（純資料）。教學頁的「開啟起始練習檔」連結與 test/unit-starts.mjs 依此核對。
// 第四、五、六、七、十一、十二單元的檔案在 unit-start-examples.js（用到才載入）；其餘沿用既有的練習範例。
export const UNIT_STARTS = [
  { unit: 1, page: 'teaching.html', title: '基本操作：空白畫布', example: 'empty-challenge' },
  { unit: 2, page: 'teaching-fourbar.html', title: '四連桿雨刷：缺桿雨刷', example: 'wiper-missing-coupler' },
  { unit: 3, page: 'teaching-slider.html', title: '80 mm 推送器：缺桿滑塊曲柄', example: 'slider-crank-practice' },
  { unit: 4, page: 'teaching-gears.html', title: '齒輪傳動：空白畫布', example: 'unit4-start' },
  { unit: 5, page: 'teaching-gripper.html', title: '齒輪與夾指聯集：已存好的齒輪對', example: 'unit5-start' },
  { unit: 6, page: 'teaching-rack.html', title: '齒條升降器：槽長 144 mm', example: 'unit6-start' },
  { unit: 7, page: 'teaching-tipping-bucket.html', title: '單軸翻斗：結束角 −100°', example: 'unit7-start' },
  { unit: 8, page: 'teaching-assembly.html', title: '升降夾爪組立：兩個模組分開', example: 'assembly-lift-gripper-practice' },
  { unit: 9, page: 'teaching-hydraulic.html', title: '針筒推動單臂：待安裝單臂', example: 'hydraulic-h01-practice' },
  { unit: 10, page: 'teaching-hydraulic.html', title: '升降與夾取：待安裝升降', example: 'hydraulic-h02-practice' },
  { unit: 11, page: 'teaching-hydraulic.html', title: '升降＋夾爪：待接合', example: 'unit11-start' },
  { unit: 12, page: 'teaching-hydraulic.html', title: '三軸機械手臂：待加底盤', example: 'unit12-start' }
];
