import {plainKey,typing} from './command-ui.js';
// Confirmation belongs to the active editor; native buttons and IME retain their keys.
export function confirmEditorKey(e,panel,confirm){
  if(e.key!=='Enter'||!plainKey(e)||document.querySelector('dialog[open]')||e.target?.closest?.('button,a,summary,[role="button"],textarea,select,[contenteditable]'))return;
  const input=typing(e.target);if(input&&!panel.contains(input))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(input){
    if((input.type==='number'||input.inputMode==='decimal')&&(!input.value.trim()||!Number.isFinite(Number(input.value)))){
      input.setCustomValidity('請輸入有效數值。');input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});input.reportValidity();return;
    }
    if(!input.checkValidity())return input.reportValidity();
    // Flush the final text into the candidate before confirming, including programmatic input.
    input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();
  }
  confirm();
}
