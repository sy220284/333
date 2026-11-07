import {useEffect,useId,useRef} from 'react'
import {createPortal} from 'react-dom'
import {X} from 'lucide-react'
import {Button} from './Button'

const focusableSelector='button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'

export function Modal({open,onClose,title,children,width='medium'}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode;width?:'small'|'medium'|'large'}){
  const titleId=useId()
  const panelRef=useRef<HTMLDivElement>(null)
  const previousFocus=useRef<HTMLElement|null>(null)
  const onCloseRef=useRef(onClose)
  onCloseRef.current=onClose
  useEffect(()=>{
    if(!open)return
    previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null
    const panel=panelRef.current
    const focusFirst=()=>panel?.querySelector<HTMLElement>(focusableSelector)?.focus()
    const frame=requestAnimationFrame(focusFirst)
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onCloseRef.current();return}
      if(event.key!=='Tab'||!panel)return
      const elements=Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(element=>element.offsetParent!==null)
      if(elements.length===0){event.preventDefault();panel.focus();return}
      const first=elements[0]!,last=elements[elements.length-1]!
      if(event.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){event.preventDefault();first.focus()}
    }
    const focusIn=(event:FocusEvent)=>{if(panel&&!panel.contains(event.target as Node))focusFirst()}
    document.addEventListener('keydown',key)
    document.addEventListener('focusin',focusIn)
    const overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);document.removeEventListener('focusin',focusIn);document.body.style.overflow=overflow;previousFocus.current?.focus()}
  },[open])
  if(!open)return null
  const widths={small:'max-w-sm',medium:'max-w-lg',large:'max-w-2xl'}
  return createPortal(<div className="yy-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[var(--yy-overlay)] p-4 backdrop-blur-sm" onClick={onClose}><div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`yy-modal-panel w-full ${widths[width]} overflow-hidden rounded-xl border border-[var(--yy-border-strong)] bg-[var(--yy-surface)] shadow-2xl`} onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-[var(--yy-border)] px-5 py-4"><h2 id={titleId} className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" aria-label="关闭对话框" icon={<X size={16}/>} onClick={onClose}/></div><div className="max-h-[75vh] overflow-y-auto p-5">{children}</div></div></div>,document.body)
}
