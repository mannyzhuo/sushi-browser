if(!window.__complex_search_define__){const e="itel-highlight",t="itel-selected",n="isear-top-selected",o="@RE:";var bgColors=["#FFFF00","#88FF88","#00FFFF","#CCDDFF","#FF88FF","#FF8888","#FFAA00"],barColors=bgColors;class r{constructor(e,t=!1){if(this.enabled=!1,"OR"!=e&&0!=e.indexOf("-")){if(0==e.toUpperCase().indexOf(o)&&(e=e.substr(o.length),t=!0),t)try{this.regexp=new RegExp(e,`g${matchCase?"":"i"}`),this.regbool=!0,this.unified=e}catch(e){return}else/^"[^"]+"$|^'[^']+'$/g.test(e)||(e=e.replace(/[()]/g,"")),e=(e=e.replace(/^"(.*)"$/g,"$1")).replace(/^'(.*)'$/g,"$1"),this.unified=unifyWord(e);""!=e&&(this.enabled=!0,this.origin=e,this.count=new l,this.elems=[])}}}class s{constructor(e){if(this.array=[],this.map={},""!=(e=e.trim())){var t={},n={},s=(e=shiftLeftChars(e=shiftLeftChars(e=shiftLeftChars(e=shiftLeftChars(e,'"',"”"),"'","’"),"(","（"),")","）")).match(/-?"[^"]*"|-?'[^']+'|[^\s\t　"']+/g),l=!1,i=0;for(let e=0;e<s.length;e++){let a=s[e];if(a.toUpperCase()==o){l=!0;continue}let u=new r(a,l);if(null==u.origin)continue;let c=t;u.regbool&&(c=n),1!=c[u.unified]&&(c[u.unified]=!0,u.bgColor=bgColors[i%bgColors.length],u.barColor=barColors[i%barColors.length],i++,u.id=i,this.array.push(u),this.map[u.origin]=u)}}}getList(e){var t=[];for(let n=0;n<this.array.length;n++){let o=this.array[n][e];null!=o&&t.push(o)}return t}}class l{constructor(){this.enabled=!1,this.num=0,this.cur=0}}function shiftLeftCode(e,t,n,o){return n<=e&&e<=n+o&&(e=e-n+t),e}function shiftLeftChar(e,t,n,o){var r=e.charCodeAt(0);return r=shiftLeftCode(r,t.charCodeAt(0),n.charCodeAt(0),o),String.fromCharCode(r)}function shiftLeftChars(e,t,n,o=1){var r=[];for(let s=0;s<e.length;s++)r[s]=shiftLeftChar(e[s],t,n,o);return r.join("")}function unifyWord(e){return matchCase||(e=(e=shiftLeftChars(e=shiftLeftChars(e=shiftLeftChars(e,"!","！","~".charCodeAt(0)-"!".charCodeAt(0)),"ぁ","ァ","ゔ".charCodeAt(0)-"ぁ".charCodeAt(0))," ","　")).toUpperCase()),e}var regbool=!0,def_option={childList:!0,characterData:!0,subtree:!0},limitCount=0;function highlight_all(t,n,o){limitCount=0;const r=[];for(var s=0;s<n.array.length;s++){var l=n.array[s];regbool||(l.regbool=!1,l.regexp=void 0),l.bgColor=bgColors[s%bgColors.length],l.barColor=l.bgColor,words_nums[l.origin]=0;const i=replace_auto(t,l,e,o);o&&r.push(...i)}return r}function getAroundText(e,t,n,o){const r=[];let s=!1;for(let t of e.parentNode.childNodes)if(1==t.nodeType||3==t.nodeType){if(1==t.nodeType){if("none"==t.style.display||"hidden"==t.style.visibility||"STYLE"==t.tagName||"SCRIPT"==t.tagName||"NOSCRIPT"==t.tagName||"TEXTAREA"==t.tagName)continue;{const e=window.getComputedStyle(t);if("none"==e.display||"hidden"==e.visibility||["0px","1px"].includes(e.width)&&["0px","1px"].includes(e.height))continue}}if(e==t)s=!0;else if(s){let e=3==t.nodeType?t.data:t.innerText;if(!e)continue;(e=e.trim()).length&&(o+=` ${e}`)}else{let e=3==t.nodeType?t.data:t.innerText;if(!e)continue;(e=e.trim()).length&&r.push(e)}}return n=`${r.join(" ")} ${n}`,t.length+n.length+o.length<200?getAroundText(e.parentNode,t,n,o):[n,o]}var words_nums={},icnt=0;function replace_auto(e,t,n,o){const r=[];return textNode_req(document.body,n,r,function(e){var r=t.origin,s=e.data;if(""==s.trim())return;if(t.regbool){var l=regMatch(e.data,t.origin);if(null==l)return;r=l[0]}if(""==r)return;const i=unifyWord(e.data),a=unifyWord(r);if(o){let n,o=0,l=[];for(;-1!=(n=i.indexOf(a,o));){o=n+a.length,words_nums[t.origin]++;var u=s.substr(0,n),c=s.substr(n,r.length),d=s.substr(n+r.length);if(s.length<200){const t=getAroundText(e,s,u,d);u=t[0],d=t[1]}t.count.num++,icnt++,l.push([icnt-1,u,c,d])}return l}var f=i.indexOf(a);if(-1!=f&&!(++limitCount>1e3)){words_nums[t.origin]++;u=s.substr(0,f),c=s.substr(f,r.length),d=s.substr(f+r.length);var h=document.createTextNode(u),g=document.createTextNode(c),m=document.createTextNode(d),p=document.createElement("esspan");p.id="isear-"+icnt,p.className=n+" "+icnt,p.style.backgroundColor=t.bgColor,p.style.color="black",p.appendChild(g);var C=e.parentNode;C.replaceChild(m,e),C.insertBefore(h,m),C.insertBefore(p,m),null!=(p=document.getElementById("isear-"+icnt))&&(t.elems.push(p),t.count.num++,icnt++)}}),r}function textNode_req(e,t,n,o){if(3!=e.nodeType){if(1==e.nodeType&&!new RegExp(t,"g").test(e.className))for(var r=0;r<e.childNodes.length;r++){var s=e.childNodes[r];if(1==s.nodeType){if("none"==s.style.display||"hidden"==s.style.visibility||"STYLE"==s.tagName||"SCRIPT"==s.tagName||"NOSCRIPT"==s.tagName||"TEXTAREA"==s.tagName)continue;{const e=window.getComputedStyle(s);if("none"==e.display||"hidden"==e.visibility||["0px","1px"].includes(e.width)&&["0px","1px"].includes(e.height))continue}}textNode_req(s,t,n,o)}}else{const t=o(e);t&&t.length&&n.push(...t)}}function wordMatch(e,t,n){if(n){var o=regMatch(e,t);if(null!=o){for(var r=0;r<o.length;r++)if(o[r]==e)return!0;return!1}}return unifyWord(e)==unifyWord(t)}function regMatch(e,t){var n=null;try{n=e.match(new RegExp(t,`g${matchCase?"":"i"}`))}catch(e){return null}if(null==n)return null;for(var o=[],r=0;r<n.length;r++)""!=n[r]&&o.push(n[r]);return o}function offElementsByClassName(e){for(var t=document.getElementsByClassName(e),n=t.length-1;n>=0;n--){var o=t[n],r=document.createTextNode(o.innerText);o.parentNode.replaceChild(r,o),r.parentNode.normalize()}}function getAbsTop(e){return null==e||null==e?null:e.getBoundingClientRect().top+window.pageYOffset}function focusToObj(e){var o;if(null!=(o=document.getElementById(t))&&o.removeAttribute("id"),null!=(o=document.getElementById(n))&&o.removeAttribute("id"),null!=e&&null!=e){e.id=t;var r=e.classList,s=document.getElementsByClassName("isear-top-"+r[1])[0];null!=s&&(s.id+=n)}}function getUnderCurrentElemNum(e){for(var t=document.getElementsByClassName(e),n=0;n<t.length;n++){if(getAbsTop(t[n])>window.pageYOffset)return n}return 0}function scrollFocusAuto(e){null!=e&&null!=e&&(e.scrollIntoViewIfNeeded(),focusToObj(e))}function scrollFocusAutoNum(e,t){scrollFocusAuto(document.getElementsByClassName(e)[t])}var sfcount=0;function sfcountNext(e,t){return e++,e%=t}function sfcountPrev(e,t){return-1==--e&&(e=t-1),e}function sfcountNextWord(e,t,n,o){void 0===o&&(o=!1);for(var r=document.getElementsByClassName(t),s=sfcountPrev(e,r.length);e!=s;){if(wordMatch(r[e=sfcountNext(e,r.length)].innerText,n,o))return e}return-1}function sfcountPrevWord(e,t,n,o){void 0===o&&(o=!1);for(var r=document.getElementsByClassName(t),s=sfcountNext(e,r.length);e!=s;){if(wordMatch(r[e=sfcountPrev(e,r.length)].innerText,n,o))return e}return-1}function scrollFocusNo(e,t,n){var o=document.getElementsByClassName(t);o.length&&scrollFocusAuto(o[e])}function scrollFocusNext(e,t){init_sfcount(e,t,-1);var n=document.getElementsByClassName(e);const o=n.length;return o?(scrollFocusAuto(n[sfcount=sfcountNext(sfcount,o)]),`${sfcount+1}/${o}${o<1e3?"":"+"}`):"0/0"}function scrollFocusPrev(e,t){init_sfcount(e,t,1);var n=document.getElementsByClassName(e);const o=n.length;return o?(scrollFocusAuto(n[sfcount=sfcountPrev(sfcount,o)]),`${sfcount+1}/${o}${o<1e3?"":"+"}`):"0/0"}function scrollFocusNextWord(e,t,n,o){init_sfcount(t,n,-1),sfcount=sfcountNextWord(sfcount,t,e,o),scrollFocusAuto(document.getElementsByClassName(t)[sfcount])}function scrollFocusPrevWord(e,t,n,o){init_sfcount(t,n,1),sfcount=sfcountPrevWord(sfcount,t,e,o),scrollFocusAuto(document.getElementsByClassName(t)[sfcount])}function init_sfcount(e,t,n){null==document.getElementById(t)&&(sfcount=getUnderCurrentElemNum(e),sfcount+=n)}function countBeforeWords(e,t,n){for(var o=document.getElementsByClassName(t),r=0,s=sfcount;s>=0;s--){wordMatch(o[s].innerText,e,n)&&r++}return r}function countAllWords(e,t,n){for(var o=document.getElementsByClassName(t),r=0,s=o.length-1;s>=0;s--){wordMatch(o[s].innerText,e,n)&&r++}return r}var search_words_prev,matchCase,itel_inject_flag=!1;function itel_main(e,t,n){if("complete"==document.readyState){if(search_words_prev!=e||n!=matchCase){icnt=0,gstatus.enabled=t;var o=new s(e);return 0==o.array.length&&(t=!1),reset_all(),search_words_prev=e,matchCase=n,parsed_main(o,t)}}else window.onload=(()=>itel_main(e,t,n))}function itel_main2(e,t,n,o){if("complete"==document.readyState){o&&(e=`"${e}"`),icnt=0,gstatus.enabled=t;var r=new s(e);return 0==r.array.length&&(t=!1),reset_all(),search_words_prev=e,matchCase=n,parsed_main(r,t,!0)}window.onload=(()=>itel_main2(e,t,n))}function parsed_main(e,t,n){if(!t)return;const o=highlight_all(document.body,e,n);return n?[words_nums,o]:(defineEvents(e,t),window.onresize(null),words_nums)}var already_event=!1,gstatus={words:null,enabled:null};function defineEvents(e,t){gstatus.words=e,gstatus.enabled=t,already_event||(already_event=!0,window.onresize=function(){e=gstatus.words})}function reset_all(){offElementsByClassName("itel-highlight"),search_words_prev=void 0,matchCase=void 0}const i=document.createElement("style");i.type="text/css",i.appendChild(document.createTextNode("#itel-selected, #isear-top-selected {\n    background-color: #ff9632 !important;\n    color: black !important;\n}\n")),document.head.appendChild(i),window.__complex_search_define__={itel_main:itel_main,itel_main2:itel_main2,reset_all:reset_all,scrollFocusNo:scrollFocusNo,scrollFocusNext:scrollFocusNext,scrollFocusPrev:scrollFocusPrev}}