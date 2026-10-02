"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ALL_ITALIAN_CITY_NAMES,
  PROFESSIONAL_CATEGORIES,
  operatorProfileInviteSchema,
  type PendingProfileInvite,
  type ProfessionalCategorySlug,
  type ProfileInviteLink,
} from "@professionisti/shared";
import { Autocomplete, Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

const EMPTY_FORM = { email: "", name: "", surname: "", phone: "", businessName: "", categorySlug: "", city: "", bio: "" };

/** Valore facoltativo: stringa vuota → assente, così zod non lo valida. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Profili creati al telefono da un operatore (docs/CHANGELOG.md §169): il
 * profilo resta fuori dalla ricerca finché il professionista non apre il
 * link, sceglie la password e conferma la dichiarazione dal proprio profilo.
 */
export default function AdminProfessionistiPage() {
  const { token } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [link, setLink] = useState<ProfileInviteLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<PendingProfileInvite[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  const loadPending = useCallback(() => {
    if (!token) return;
    apiClient
      .adminListProfileInvites(token)
      .then(setPending)
      .catch((err) => setListError(errorMessage(err)));
  }, [token]);

  useEffect(loadPending, [loadPending]);

  function update(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit() {
    if (!token) return;
    const parsed = operatorProfileInviteSchema.safeParse({
      email: form.email.trim(),
      name: form.name.trim(),
      surname: optional(form.surname),
      phone: optional(form.phone),
      businessName: form.businessName.trim(),
      categorySlug: form.categorySlug as ProfessionalCategorySlug,
      city: form.city.trim(),
      bio: optional(form.bio),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Controlla i dati inseriti.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await apiClient.adminCreateProfileInvite(token, parsed.data);
      setLink(created);
      setCopied(false);
      setForm(EMPTY_FORM);
      loadPending();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function renew(userId: string) {
    if (!token) return;
    setRenewingId(userId);
    setListError(null);
    try {
      const created = await apiClient.adminNewProfileInviteLink(token, userId);
      setLink(created);
      setCopied(false);
      loadPending();
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setRenewingId(null);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <YStack gap="$4">
      <AdminPageHeader
        title="Profili da confermare"
        description="Crea il profilo di un professionista mentre sei al telefono con lui. Gli arriva un link per scegliere la password e confermare i dati: fino ad allora il profilo non compare nella ricerca."
      />

      {link ? (
        <AdminCard highlight>
          <YStack gap="$2">
            <Text fontWeight="700" color={brand.grafite}>
              Link per {link.businessName}
            </Text>
            <Text fontSize={14} color={brand.grafite70}>
              {link.emailSent
                ? `Lo abbiamo mandato anche per email a ${link.email}.`
                : `L'email non è partita: copia il link e mandalo tu a ${link.email} (per esempio su WhatsApp).`}{" "}
              Vale fino al {formatAdminDate(link.expiresAt)} e si usa una volta sola.
            </Text>
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              <input className="admin-input" style={{ flex: 1, minWidth: 260 }} readOnly value={link.inviteUrl} onFocus={(e) => e.target.select()} />
              <Button size="$3" onPress={copyLink}>
                {copied ? "Copiato" : "Copia link"}
              </Button>
            </XStack>
          </YStack>
        </AdminCard>
      ) : null}

      <AdminCard>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void submit();
          }}
        >
          <YStack gap="$3">
            <Text fontWeight="700" color={brand.grafite}>
              Nuovo profilo
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              <input className="admin-input" style={{ flex: 1, minWidth: 200 }} placeholder="Nome *" value={form.name} onChange={(e) => update("name", e.target.value)} />
              <input className="admin-input" style={{ flex: 1, minWidth: 200 }} placeholder="Cognome" value={form.surname} onChange={(e) => update("surname", e.target.value)} />
            </XStack>
            <XStack gap="$2" flexWrap="wrap">
              <input
                className="admin-input"
                style={{ flex: 1, minWidth: 200 }}
                type="email"
                placeholder="Email *"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
              <input
                className="admin-input"
                style={{ flex: 1, minWidth: 200 }}
                type="tel"
                placeholder="Telefono"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </XStack>
            <XStack gap="$2" flexWrap="wrap">
              <input
                className="admin-input"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Nome dell'attività *"
                value={form.businessName}
                onChange={(e) => update("businessName", e.target.value)}
              />
              <select className="admin-input" style={{ flex: 1, minWidth: 200 }} value={form.categorySlug} onChange={(e) => update("categorySlug", e.target.value)}>
                <option value="">Categoria *</option>
                {PROFESSIONAL_CATEGORIES.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.label}
                  </option>
                ))}
              </select>
            </XStack>
            <YStack>
              <Autocomplete
                items={ALL_ITALIAN_CITY_NAMES}
                getKey={(item) => item}
                getLabel={(item) => item}
                onSelect={(value) => update("city", value)}
                value={form.city}
                onChangeText={(value) => update("city", value)}
                placeholder="Comune * (scrivi almeno 3 lettere)"
                size="$4"
                minChars={3}
              />
            </YStack>
            <textarea
              className="admin-input"
              rows={3}
              placeholder="Presentazione (facoltativa, il professionista potrà cambiarla)"
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
            />
            {formError ? <Text color={brand.urgenza}>{formError}</Text> : null}
            <XStack>
              <Button size="$4" disabled={saving} onPress={() => void submit()}>
                {saving ? "Creazione…" : "Crea profilo e link"}
              </Button>
            </XStack>
          </YStack>
        </form>
      </AdminCard>

      <YStack gap="$2">
        <Text fontWeight="700" color={brand.grafite}>
          In attesa di conferma
        </Text>
        {listError ? <Text color={brand.urgenza}>{listError}</Text> : null}
        {pending === null && !listError ? (
          <SkeletonTableRows rows={3} cols={4} />
        ) : pending && pending.length === 0 ? (
          <Text color={brand.grafite70}>Nessun profilo in attesa.</Text>
        ) : pending ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Attività</th>
                  <th>Email</th>
                  <th>Categoria e comune</th>
                  <th>Creato il</th>
                  <th>Link valido fino al</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.businessName}</td>
                    <td>{row.email}</td>
                    <td>
                      {row.categoryLabel}, {row.city}
                    </td>
                    <td>{formatAdminDate(row.createdAt)}</td>
                    <td>{row.lastLinkExpiresAt ? formatAdminDate(row.lastLinkExpiresAt) : "Scaduto"}</td>
                    <td>
                      <Button variant="secondary" size="$2" disabled={renewingId === row.userId} onPress={() => renew(row.userId)}>
                        {renewingId === row.userId ? "…" : "Nuovo link"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </YStack>
    </YStack>
  );
}
