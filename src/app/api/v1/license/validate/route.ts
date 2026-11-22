export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signEntitlementToken, PLAN_DEFAULT_ENTITLEMENTS, PlanTier } from "@/lib/license-core";

const SECRET = process.env.LICENSE_HMAC_SECRET || "technext_avro_license_hmac_master_secret_2026";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { licenseKey, domain, installationUuid, storeVersion } = body;
    const ipAddress = req.headers.get("x-forwarded-for") || "127.0.0.1";

    if (!licenseKey) {
      return NextResponse.json(
        { success: false, error: "License key is required." },
        { status: 400, headers: corsHeaders }
      );
    }

    const license = await prisma.license.findUnique({
      where: { licenseKey: licenseKey.trim() },
      include: {
        customer: true,
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!license) {
      return NextResponse.json(
        {
          success: false,
          error: "License key not recognized by TECHNEXT licensing authority.",
          code: "LICENSE_NOT_FOUND",
        },
        { status: 404, headers: corsHeaders }
      );
    }

    // Check status
    if (license.status === "SUSPENDED" || license.status === "REVOKED") {
      await prisma.licenseValidationLog.create({
        data: {
          licenseId: license.id,
          licenseKey: license.licenseKey,
          domain,
          installationUuid,
          storeVersion,
          ipAddress,
          outcome: license.status,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: `License is currently ${license.status}. Please contact info.technexttech@gmail.com.`,
          code: `LICENSE_${license.status}`,
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Check expiration
    const now = new Date();
    if (now > license.expiresAt) {
      await prisma.licenseValidationLog.create({
        data: {
          licenseId: license.id,
          licenseKey: license.licenseKey,
          domain,
          installationUuid,
          storeVersion,
          ipAddress,
          outcome: "EXPIRED",
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: "Subscription license expired. Please renew in your AVRO account.",
          code: "LICENSE_EXPIRED",
          expiresAt: license.expiresAt,
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Check Domain binding
    if (license.boundDomain && domain) {
      const cleanBound = license.boundDomain.replace(/https?:\/\//, "").replace(/\/$/, "").toLowerCase();
      const cleanInput = domain.replace(/https?:\/\//, "").replace(/\/$/, "").toLowerCase();

      // Allow exact match, wildcard, comma-separated domains, or local/preview variants
      const boundList = cleanBound.split(",").map((d) => d.trim());
      const isMatch =
        cleanBound === "*" ||
        boundList.includes(cleanInput) ||
        boundList.some((b) => b === "*" || (b.startsWith("*.") && cleanInput.endsWith(b.slice(1)))) ||
        (cleanBound.includes("localhost") && cleanInput.includes("localhost")) ||
        (cleanBound.includes("aithrithi") && cleanInput.includes("aithrithi"));

      if (!isMatch) {
        await prisma.licenseValidationLog.create({
          data: {
            licenseId: license.id,
            licenseKey: license.licenseKey,
            domain,
            installationUuid,
            storeVersion,
            ipAddress,
            outcome: "INVALID_DOMAIN",
          },
        });

        return NextResponse.json(
          {
            success: false,
            error: `License is bound to domain '${license.boundDomain}', but request originated from '${domain}'.`,
            code: "DOMAIN_MISMATCH",
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // Parse entitlements from plan or defaults
    const planTier = (license.planTier || "BASIC") as PlanTier;
    let entitlements = PLAN_DEFAULT_ENTITLEMENTS[planTier];
    if (license.subscription?.plan?.entitlementsJson) {
      try {
        entitlements = JSON.parse(license.subscription.plan.entitlementsJson);
      } catch (e) {
        // fallback
      }
    }

    // Log success & update heartbeat
    await prisma.$transaction([
      prisma.license.update({
        where: { id: license.id },
        data: { lastHeartbeatAt: new Date() },
      }),
      prisma.licenseValidationLog.create({
        data: {
          licenseId: license.id,
          licenseKey: license.licenseKey,
          domain,
          installationUuid,
          storeVersion,
          ipAddress,
          outcome: "SUCCESS",
        },
      }),
    ]);

    // Generate signed token
    const token = signEntitlementToken(
      {
        licenseKey: license.licenseKey,
        customerId: license.customerId,
        subscriptionId: license.subscriptionId,
        plan: planTier,
        boundDomain: license.boundDomain,
        installationUuid: license.installationUuid,
        issuedAt: license.createdAt.toISOString(),
        expiresAt: license.expiresAt.toISOString(),
        entitlements,
        status: "ACTIVE",
      },
      SECRET
    );

    // Fetch active broadcasts for this installation/tier
    const activeBroadcasts = await prisma.systemBroadcast.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        targetTier: { in: ["ALL", planTier] },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        message: true,
        severity: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        valid: true,
        plan: planTier,
        status: "ACTIVE",
        boundDomain: license.boundDomain,
        expiresAt: license.expiresAt,
        entitlements,
        token,
        broadcasts: activeBroadcasts,
        message: "License validated successfully by TECHNEXT Licensing Engine.",
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("License validation error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal licensing error." },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
