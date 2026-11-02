export function describeAgent(ua = '') {
 ua = ua || '';
 const match=ua.match(/(Edg|OPR|Chrome|Firefox)\/([\d.]+)/)||ua.match(/(Version)\/([\d.]+).*Safari/);
 const names={Edg:'Edge',OPR:'Opera',Version:'Safari'};
 return {browser:match?`${names[match[1]]||match[1]} ${match[2].split('.')[0]}`:'ไม่ทราบเบราว์เซอร์',os:/Windows NT 10/.test(ua)?'Windows 10 / 11':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Mac OS X/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'ไม่ทราบระบบ',type:/iPad|Tablet/.test(ua)?'แท็บเล็ต':/Mobile|iPhone/.test(ua)?'มือถือ':ua?'คอมพิวเตอร์':'ไม่ทราบอุปกรณ์'};
}
export function networkLabel(ip){if(!ip)return 'ไม่ทราบเครือข่าย';if(['::1','127.0.0.1','::ffff:127.0.0.1'].includes(ip))return 'เครื่องนี้ (localhost)';if(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))return 'เครือข่ายภายใน';return 'IP ภายนอก · ไม่มีข้อมูลตำแหน่ง';}

