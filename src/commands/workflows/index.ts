import type { Command } from '../../commands.js'
const workflows:Command={
  type:'local-jsx',
  name:'workflows',
  description:'View and control background workflows',
  load:()=>import('./workflows.js'),
}
export default workflows
