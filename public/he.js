/* Translate service diagnostics without changing API status codes or stored history. */
const hebrewMessages = {
  "The club rejected this request": "מערכת הקאנטרי לא אישרה את הפעולה. יש לבדוק את ההרשמות בפיזיקל לפני ניסיון נוסף.",
  "Class timestamp has no explicit timezone": "לא ניתן לזהות את שעת החוג שהתקבלה מהקאנטרי. יש לעדכן את לוח החוגים.",
  "Same-origin request required": "מטעמי אבטחה יש לבצע את הפעולה מתוך האפליקציה. יש לפתוח אותה מחדש ולנסות שוב.",
  "Too many attempts. Try again in 15 minutes.": "בוצעו יותר מדי ניסיונות כניסה. אפשר לנסות שוב בעוד 15 דקות.",
  "Enter your Fizikal phone number and password": "יש להזין את מספר הטלפון והסיסמה לפיזיקל.",
  "Fizikal sign-in failed. Check your details or try again shortly.": "הכניסה לפיזיקל לא הצליחה. יש לבדוק את מספר הטלפון והסיסמה או לנסות שוב בעוד כמה דקות.",
  "Sign in with your Fizikal account": "יש להיכנס עם חשבון הפיזיקל האישי.",
  "The signed-in account changed. Please sign in again.": "החשבון המחובר השתנה. יש להיכנס מחדש.",
  "Choose a class from the schedule": "יש לבחור חוג מתוך לוח החוגים.",
  "An operation for this class is already running. Refresh shortly.": "כבר מתבצעת פעולה לחוג הזה. יש להמתין מעט ולעדכן את התצוגה.",
  "Invalid date": "התאריך אינו תקין. יש לבחור יום מתוך לוח החוגים.",
  "Enter your club phone number and password": "יש להזין את מספר הטלפון והסיסמה לפיזיקל.",
  "Sign out before switching to another Fizikal account": "כדי לעבור לחשבון פיזיקל אחר יש לצאת תחילה מהחשבון הנוכחי.",
  "Class changed. Refresh the schedule.": "פרטי החוג השתנו. יש לעדכן את לוח החוגים.",
  "This class requires manual booking on Fizikal": "לחוג הזה יש להירשם ישירות בפיזיקל.",
  "A weekly rule already exists for this class": "כבר הוגדרה הרשמה שבועית לחוג הזה.",
  "Rule not found": "ההרשמה השבועית לא נמצאה. יש לעדכן את התצוגה.",
  "Invalid rule setting": "הגדרת ההרשמה אינה תקינה. יש לנסות שוב.",
  "Not found": "הפעולה המבוקשת לא נמצאה.",
  "JSON required": "לא ניתן לשלוח את הבקשה. יש לפתוח מחדש את האפליקציה ולנסות שוב.",
  "Request too large": "הבקשה גדולה מדי. יש לפתוח מחדש את האפליקציה ולנסות שוב.",
  "Sign in with your Fizikal account again": "יש להיכנס שוב לחשבון פיזיקל.",
  "Your club membership changed. Sign in again.": "פרטי המנוי בקאנטרי השתנו. יש להיכנס שוב.",
  "This class is no longer available": "החוג הזה כבר אינו זמין להרשמה.",
  "Class full. Enable the waitlist option to join it.": "החוג מלא. כדי להצטרף לרשימת ההמתנה יש לסמן את האפשרות המתאימה.",
  "The club is not accepting registrations for this class": "לא ניתן להירשם כעת לחוג הזה בקאנטרי.",
  "Registration is not confirmed. Refresh Upcoming classes before trying again.": "ההרשמה עדיין לא אושרה. לפני ניסיון נוסף יש לעדכן את ״ההרשמות שלי״ ולבדוק אם ההרשמה נקלטה.",
  "Cancellation is not confirmed. The class is still booked.": "הביטול לא אושר. ההרשמה לחוג עדיין בתוקף.",
  "Connect your club account first": "יש להתחבר תחילה לחשבון פיזיקל.",
  "Registration is not open yet": "ההרשמה עדיין לא נפתחה.",
  "Booking response received; waiting for club confirmation": "התקבלה תשובה לבקשת ההרשמה; ממתינים לאישור הקאנטרי.",
  "Could not read club configuration": "לא ניתן להתחבר למערכת הקאנטרי. יש לנסות שוב מאוחר יותר.",
  "Club configuration changed": "הגדרות מערכת הקאנטרי השתנו. נדרשת בדיקה של החיבור.",
  "Unexpected booking service URL": "כתובת מערכת ההרשמה השתנתה. נדרשת בדיקה של החיבור.",
  "Multiple family members found. Member selection needs to be added before booking.": "נמצאו כמה בני משפחה בחשבון. עדיין אין באפליקציה אפשרות לבחור בן משפחה; יש להשתמש בפיזיקל.",
  "Login did not return a member at this club": "לא נמצא מנוי מתאים בקאנטרי בחשבון הזה.",
  "Schedule range too large": "טווח התאריכים גדול מדי. יש לבחור טווח קצר יותר.",
  "Unexpected club schedule response": "לא ניתן לקרוא את לוח החוגים שהתקבל מהקאנטרי. יש לנסות שוב מאוחר יותר.",
  "This class needs a purchase, seat, or reservation selection. Book it on Fizikal.": "החוג דורש רכישה או בחירת מקום. יש להירשם אליו ישירות בפיזיקל.",
  "Unexpected member bookings response": "לא ניתן לקרוא את ההרשמות שהתקבלו מפיזיקל. יש לנסות שוב מאוחר יותר.",
  "The club cancellation deadline has passed. Contact the club.": "המועד האחרון לביטול חלף. יש לפנות לקאנטרי.",
  "This class is not currently booked": "אין כרגע הרשמה לחוג הזה.",
  "No active weekly rules": "אין הרשמות שבועיות פעילות.",
  "Class removed, changed, or weekly rule paused": "החוג הוסר או השתנה, או שההרשמה השבועית הושהתה.",
  "Weekly rule paused": "ההרשמה השבועית הושהתה.",
  "Opening window missed; no late booking attempted": "מועד ההרשמה חלף. לא בוצע ניסיון הרשמה מאוחר.",
  "Class changed or is no longer on the schedule": "החוג השתנה או אינו מופיע עוד בלוח החוגים.",
  "Registration confirmed by the club": "ההרשמה אושרה בקאנטרי.",
  "Waitlist confirmed by the club": "ההצטרפות לרשימת ההמתנה אושרה בקאנטרי.",
  "Manual booking needed: purchase, seat, or reservation selection": "יש להירשם ישירות בפיזיקל: נדרשת רכישה או בחירת מקום.",
  "Class full; waitlist not enabled or unavailable": "החוג מלא. ההצטרפות לרשימת המתנה לא נבחרה או אינה זמינה.",
  "Rule paused or account disconnected": "ההרשמה השבועית הושהתה או שהחשבון נותק.",
  "This occurrence excluded by user": "המפגש הזה הוחרג מההרשמה השבועית בעקבות ביטול.",
  "One-time registration confirmed by club": "ההרשמה החד־פעמית אושרה בקאנטרי.",
  "Account disconnected": "החשבון נותק.",
  "Weekly rule changed": "הגדרת ההרשמה השבועית השתנתה."
};
function heText(value) {
  if (!value) return '';
  const text = String(value);
  if (hebrewMessages[text]) return hebrewMessages[text];
  if (/Club service returned HTTP \d+/.test(text)) return 'מערכת הקאנטרי אינה זמינה כרגע. יש לנסות שוב בעוד כמה דקות.';
  if (/Failed to fetch|fetch failed|NetworkError|Load failed|timeout|aborted/i.test(text)) return 'לא ניתן להשלים את הפעולה בגלל בעיית חיבור. יש לבדוק את החיבור ולעדכן את ההרשמות לפני ניסיון נוסף.';
  if (/[\u0590-\u05ff]/.test(text)) return text;
  return 'הפעולה לא הושלמה או שתוצאתה עדיין לא אושרה. יש לעדכן את התצוגה ולבדוק את ההרשמות לפני ניסיון נוסף.';
}
