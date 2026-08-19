/**
 * Prints a signed session cookie for an account, so pages can be checked with
 * curl without driving the login form:
 *
 *   npx tsx scripts/dev-token.ts admin@eduplus.school
 *   curl -s -H "Cookie: eduplus_session=$TOKEN" http://localhost:3100/dashboard
 */
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] ?? "admin@eduplus.school";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  console.log(token);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await prisma.$disconnect();
    process.exit(1);
  });
