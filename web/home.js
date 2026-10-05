import './account/account-nav.js';
const $=id=>document.getElementById(id);
function menu(open){$('moduleMenu').hidden=!open;$('menuBackdrop').hidden=!open;$('menuButton').setAttribute('aria-expanded',String(open));if(open)$('menuClose').focus();else $('menuButton').focus()}
$('menuButton').onclick=()=>menu($('moduleMenu').hidden);$('menuClose').onclick=()=>menu(false);$('menuBackdrop').onclick=()=>menu(false);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('moduleMenu').hidden)menu(false)});

const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const sections=[...document.querySelectorAll('.tool-section')];
const cards=sections.flatMap(section=>[...section.querySelectorAll('.tool-card')].map(card=>({card,section,text:normalize(card.textContent)})));
let category='all';
function filterTools(){
  const terms=normalize($('toolSearch').value).split(/\s+/).filter(Boolean);let count=0;
  for(const item of cards){const visible=(category==='all'||item.section.dataset.group===category)&&terms.every(term=>item.text.includes(term));item.card.hidden=!visible;if(visible)count++;}
  for(const section of sections){const available=cards.filter(item=>item.section===section);section.hidden=!available.some(item=>!item.card.hidden);const countLabel=section.querySelector('.section-heading small');if(countLabel)countLabel.textContent=available.length+' herramientas';}
  $('clearSearch').hidden=!$('toolSearch').value;
  $('noTools').hidden=count>0;
  $('searchStatus').textContent=`${count} ${count===1?'herramienta disponible':'herramientas disponibles'}`;
}
$('toolSearch').addEventListener('input',filterTools);
$('clearSearch').onclick=()=>{$('toolSearch').value='';filterTools();$('toolSearch').focus();};
const filters=[...document.querySelectorAll('[data-category]')];
function setCategory(value){category=value;for(const button of filters){const active=button.dataset.category===category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}filterTools();}
for(const button of filters)button.onclick=()=>setCategory(button.dataset.category);
$('resetFilters').onclick=()=>{$('toolSearch').value='';setCategory('all');$('toolSearch').focus();};
filterTools();
