import {ButtonHTMLAttributes,forwardRef} from 'react'
import {Slot} from '@radix-ui/react-slot'
import {LoaderCircle} from 'lucide-react'

type Props=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger'|'success';size?:'xs'|'sm'|'base'|'lg';loading?:boolean;icon?:React.ReactNode;asChild?:boolean}
export const Button=forwardRef<HTMLButtonElement,Props>(function Button({variant='primary',size='base',loading,icon,asChild=false,className='',children,disabled,...props},ref){
  const Comp=asChild?Slot:'button'
  const isIconOnly=!children&&!!icon
  const buttonProps=asChild?props:{type:'button' as const,...props}
  const variants:Record<string,React.CSSProperties>={
    primary:{background:'var(--yy-accent)',color:'var(--yy-accent-ink)',borderColor:'var(--yy-accent)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.14),0 2px 5px rgba(44,34,27,.06)'},
    secondary:{background:'var(--yy-surface-raised)',color:'var(--yy-text-2)',borderColor:'var(--yy-border)',boxShadow:'0 1px 2px rgba(44,34,27,.02)'},
    ghost:{background:'transparent',color:'var(--yy-muted)',borderColor:'transparent'},
    danger:{background:'var(--yy-danger-soft)',color:'var(--yy-danger)',borderColor:'var(--yy-danger-border)'},
    success:{background:'var(--yy-success-soft)',color:'var(--yy-success)',borderColor:'var(--yy-success-border)'}
  }
  const hoverVariants:Record<string,React.CSSProperties>={
    primary:{background:'var(--yy-accent-hover)',color:'var(--yy-accent-ink)',borderColor:'var(--yy-accent-hover)'},
    secondary:{background:'var(--yy-surface-hover)',color:'var(--yy-text)',borderColor:'var(--yy-border-strong)'},
    ghost:{background:'var(--yy-surface-hover)',color:'var(--yy-text)',borderColor:'transparent'},
    danger:{background:'var(--yy-danger)',color:'var(--yy-danger-contrast)',borderColor:'var(--yy-danger)'},
    success:{background:'var(--yy-success)',color:'var(--yy-success-contrast)',borderColor:'var(--yy-success)'}
  }
  const sizes:Record<string,string>={xs:'h-6 text-[11px] gap-1',sm:'h-7 text-xs gap-1.5',base:'h-8 text-[12.5px] gap-[7px]',lg:'h-9 text-[13px] gap-2'}
  const squareSizes:Record<string,string>={xs:'w-6',sm:'w-7',base:'w-8',lg:'w-9'}
  const paddings:Record<string,string>={xs:'px-2',sm:'px-2.5',base:'px-3',lg:'px-3.5'}
  const iconSizes:Record<string,string>={xs:'[&_svg]:size-3',sm:'[&_svg]:size-[13px]',base:'[&_svg]:size-[13px]',lg:'[&_svg]:size-4'}
  return <Comp ref={ref} className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[5px] border font-medium tracking-[-0.005em] transition-[background,color,border-color,box-shadow,transform,opacity] duration-[140ms] ease-[cubic-bezier(.4,0,.2,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--yy-accent)] active:scale-[.985] disabled:pointer-events-none disabled:opacity-35 data-[motion=off]:transition-none data-[motion=off]:active:scale-100 [@media(prefers-reduced-motion:reduce)]:transition-none [@media(prefers-reduced-motion:reduce)]:active:scale-100 ${sizes[size]} ${isIconOnly?squareSizes[size]:paddings[size]} ${iconSizes[size]} ${className}`} style={{...variants[variant],...props.style}} disabled={disabled||loading} aria-busy={loading||undefined} data-variant={variant} onMouseEnter={e=>{if(disabled||loading)return;const s=hoverVariants[variant];Object.assign(e.currentTarget.style,s)}} onMouseLeave={e=>{const s=variants[variant];Object.assign(e.currentTarget.style,s)}} {...buttonProps}>{loading?<LoaderCircle className="animate-spin data-[motion=off]:animate-none [@media(prefers-reduced-motion:reduce)]:animate-none"/>:icon}{children}</Comp>
})
