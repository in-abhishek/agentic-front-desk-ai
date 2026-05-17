#  Smart Home Loans - AI Front Desk Agent

Smart Home Loans Front Desk Agent ek intelligent, agentic conversational assistant hai jo customers ki loan applications aur inquiries ko autonomously handle karta hai. Yeh project **Next.js**, **AI SDK (Vercel)**, **Groq (Llama 3.3 70B)**, **MongoDB**, aur **Redis** ka use karke banaya gaya hai.

Iske andar traditional hardcoded `if/else` chatbot routers ke badle **Declarative Agentic Workflows** (Prompt-Driven Orchestration) ka use kiya gaya hai, jisse AI khud context ke hisab se sahi backend tools ko trigger karta hai.

---

##  Key Features & Agentic Architecture

1. **Context-Aware Client Lookup (No OTP Friction):** Jab user email share karta hai, AI automatically database check karta hai. Agar profile milti hai (`FOUND`), toh bina OTP ke direct personalized status batata hai.
2. **Dynamic OTP Authentication:** Agar email unrecognized hai (`NOT_FOUND`), toh system autonomously ek 4-digit OTP generate karke Redis Cache mein save karta hai aur user ko email par send karta hai.
3. **Automated Adviser Notification:** Jab client chat mein kisi document (jaise Salary Slip ya Form 16) ko submit ya mention karta hai, AI semantic language samajh kar turant `notifyAdviser` tool call karta hai aur assigned officer ko ek professional HTML-formatted email alert bhejta hai.
4. **Parallel Tool Calling (Multi-turn Loop):** Agar user ek hi line mein email aur document submission dono bol de, toh system ek hi turn mein upar-neeche processing karke dono tools execute kar sakta hai (`maxSteps: 3`).

---

##  Tech Stack

- **Frontend & Backend:** Next.js 14+ (App Router)
- **AI Framework:** Vercel AI SDK Core
- **LLM Provider:** Groq Cloud (`llama-3.3-70b-versatile`)
- **Database:** MongoDB (via Mongoose)
- **Cache / OTP Store:** Redis
- **Email Service:** Nodemailer (Gmail SMTP)

---

##  Prerequisites (System Requirements)

Shuru karne se pehle aapke system mein yeh cheezein installed honi chahiye:
- **Node.js** (v18 or higher)
- **MongoDB** (Local instance ya MongoDB Atlas connection string)
- **Redis Server** (Local instance ya Upstash Redis URL)

---

## 🔧 Installation & Setup Steps

### Step 1: Clone the Repository
```bash
git clone [https://github.com/your-username/smart-home-loans-agent.git](https://github.com/your-username/smart-home-loans-agent.git)
cd smart-home-loans-agent